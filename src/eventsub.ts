import WebSocket, { RawData } from 'ws';
import { config } from './config';
import { createLogger } from './logger';

const logger = createLogger('EventSub');

const EVENTSUB_WS_URL = 'wss://eventsub.wss.twitch.tv/ws';
const HELIX_BASE_URL = 'https://api.twitch.tv/helix';
const OAUTH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30_000;
const KEEPALIVE_GRACE_MS = 10_000;

export interface RewardRedemptionEvent {
  id: string;
  userId: string;
  userLogin: string;
  userName: string;
  rewardId: string;
  rewardTitle: string;
  userInput: string;
  redeemedAt: string;
}

type RewardRedemptionHandler = (event: RewardRedemptionEvent) => void;

interface AppAccessToken {
  token: string;
  expiresAt: number;
}

/**
 * Подключение к Twitch EventSub через WebSocket-транспорт: держит сессию,
 * переподключается при разрыве и создаёт подписку на редемпшены Channel Points.
 *
 * Примечание: для создания подписки channel.channel_points_custom_reward_redemption.add
 * используется TWITCH_OAUTH_TOKEN — этот токен должен принадлежать бродкастеру
 * (или модератору с доступом к редемпшенам) и иметь scope channel:read:redemptions.
 */
export class EventSubClient {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private keepaliveTimeoutSeconds = 10;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private stopped = false;
  private replacingConnection = false;
  private subscriptionReady = false;

  private broadcasterId: string | null = null;
  private appAccessToken: AppAccessToken | null = null;

  private redemptionHandler: RewardRedemptionHandler | null = null;

  onRewardRedemption(handler: RewardRedemptionHandler): void {
    this.redemptionHandler = handler;
  }

  start(): void {
    this.stopped = false;
    this.connect(EVENTSUB_WS_URL);
  }

  stop(): void {
    this.stopped = true;
    this.clearWatchdog();
    this.ws?.close();
    this.ws = null;
  }

  private connect(url: string, isReplacement = false): void {
    logger.info(isReplacement ? 'Открываю новое соединение для переподключения...' : 'Подключаюсь к EventSub WebSocket...');
    const socket = new WebSocket(url);

    socket.on('open', () => {
      logger.debug('WebSocket соединение открыто');
    });

    socket.on('message', (data) => {
      this.handleMessage(data, socket, isReplacement);
    });

    socket.on('close', (code, reason) => {
      this.handleClose(socket, isReplacement, code, reason.toString());
    });

    socket.on('error', (error) => {
      logger.error('Ошибка WebSocket соединения', error);
    });
  }

  private handleMessage(data: RawData, socket: WebSocket, isReplacement: boolean): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString());
    } catch (error) {
      logger.error('Не удалось разобрать сообщение EventSub', error);
      return;
    }

    const message = parsed as {
      metadata?: { message_type?: string };
      payload?: Record<string, unknown>;
    };

    const messageType = message.metadata?.message_type;
    const payload = message.payload ?? {};

    switch (messageType) {
      case 'session_welcome':
        this.handleSessionWelcome(payload, socket, isReplacement);
        break;
      case 'session_keepalive':
        this.resetWatchdog();
        break;
      case 'session_reconnect':
        this.handleSessionReconnect(payload);
        break;
      case 'notification':
        this.resetWatchdog();
        this.handleNotification(payload);
        break;
      case 'revocation':
        logger.warn('Подписка отозвана Twitch', payload);
        break;
      default:
        logger.debug(`Необработанный тип сообщения: ${messageType}`);
    }
  }

  private handleSessionWelcome(payload: Record<string, unknown>, socket: WebSocket, isReplacement: boolean): void {
    const session = payload.session as
      | { id?: string; keepalive_timeout_seconds?: number }
      | undefined;

    if (!session?.id) {
      logger.error('session_welcome без session.id', payload);
      return;
    }

    if (isReplacement && this.ws) {
      logger.info('Новое соединение готово, закрываю старое');
      const oldWs = this.ws;
      this.replacingConnection = false;
      oldWs.close();
    }

    this.ws = socket;
    this.sessionId = session.id;
    this.keepaliveTimeoutSeconds = session.keepalive_timeout_seconds ?? 10;
    this.reconnectAttempts = 0;
    this.resetWatchdog();

    logger.info(`EventSub сессия установлена (session_id=${this.sessionId})`);

    if (!this.subscriptionReady) {
      void this.ensureSubscription();
    }
  }

  private handleSessionReconnect(payload: Record<string, unknown>): void {
    const session = payload.session as { reconnect_url?: string } | undefined;
    const reconnectUrl = session?.reconnect_url;

    if (!reconnectUrl) {
      logger.warn('session_reconnect без reconnect_url, выполняю обычное переподключение');
      this.scheduleReconnect();
      return;
    }

    logger.info('Twitch запросил переподключение к новому URL');
    this.replacingConnection = true;
    this.connect(reconnectUrl, true);
  }

  private handleNotification(payload: Record<string, unknown>): void {
    const subscription = payload.subscription as { type?: string } | undefined;
    const event = payload.event as Record<string, unknown> | undefined;

    if (subscription?.type !== 'channel.channel_points_custom_reward_redemption.add' || !event) {
      return;
    }

    const reward = event.reward as { id?: string; title?: string } | undefined;

    const redemption: RewardRedemptionEvent = {
      id: String(event.id ?? ''),
      userId: String(event.user_id ?? ''),
      userLogin: String(event.user_login ?? ''),
      userName: String(event.user_name ?? ''),
      rewardId: String(reward?.id ?? ''),
      rewardTitle: String(reward?.title ?? ''),
      userInput: String(event.user_input ?? ''),
      redeemedAt: String(event.redeemed_at ?? ''),
    };

    this.redemptionHandler?.(redemption);
  }

  private handleClose(socket: WebSocket, isReplacement: boolean, code: number, reason: string): void {
    if (this.replacingConnection && isReplacement) {
      // Новое соединение не смогло открыться — остаёмся на старом и повторим позже.
      this.replacingConnection = false;
      logger.warn(`Не удалось установить новое соединение при переподключении (код ${code}: ${reason})`);
      this.scheduleReconnect();
      return;
    }

    if (socket !== this.ws) {
      // Закрылось старое соединение после успешной замены — это ожидаемо.
      return;
    }

    this.clearWatchdog();
    this.ws = null;

    if (this.stopped) {
      logger.info('EventSub соединение закрыто (остановлено вручную)');
      return;
    }

    logger.warn(`EventSub соединение разорвано (код ${code}: ${reason}), переподключаюсь...`);
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;

    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempts,
      RECONNECT_MAX_DELAY_MS,
    );
    this.reconnectAttempts += 1;

    logger.info(`Переподключение через ${delay}мс (попытка ${this.reconnectAttempts})`);
    setTimeout(() => {
      if (!this.stopped) {
        this.connect(EVENTSUB_WS_URL);
      }
    }, delay);
  }

  private resetWatchdog(): void {
    this.clearWatchdog();
    const timeoutMs = this.keepaliveTimeoutSeconds * 1000 + KEEPALIVE_GRACE_MS;
    this.watchdogTimer = setTimeout(() => {
      logger.warn('Не получали сообщений от EventSub слишком долго, переподключаюсь');
      this.ws?.close();
    }, timeoutMs);
  }

  private clearWatchdog(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private async ensureSubscription(): Promise<void> {
    if (!this.sessionId) return;

    try {
      if (!this.broadcasterId) {
        const appToken = await this.getAppAccessToken();
        this.broadcasterId = await this.getBroadcasterId(appToken);
      }

      await this.subscribeToChannelPointsRedemption(this.sessionId, this.broadcasterId);
      this.subscriptionReady = true;
      logger.info('Подписка на редемпшены Channel Points создана');
    } catch (error) {
      logger.error('Не удалось создать подписку EventSub', error);
    }
  }

  private async getAppAccessToken(): Promise<string> {
    if (this.appAccessToken && this.appAccessToken.expiresAt > Date.now()) {
      return this.appAccessToken.token;
    }

    const params = new URLSearchParams({
      client_id: config.twitchClientId,
      client_secret: config.twitchClientSecret,
      grant_type: 'client_credentials',
    });

    const response = await fetch(`${OAUTH_TOKEN_URL}?${params.toString()}`, { method: 'POST' });
    if (!response.ok) {
      throw new Error(`Не удалось получить app access token: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    this.appAccessToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000 - 60_000,
    };

    return this.appAccessToken.token;
  }

  private async getBroadcasterId(appToken: string): Promise<string> {
    const response = await fetch(`${HELIX_BASE_URL}/users?login=${encodeURIComponent(config.twitchChannel)}`, {
      headers: {
        Authorization: `Bearer ${appToken}`,
        'Client-Id': config.twitchClientId,
      },
    });

    if (!response.ok) {
      throw new Error(`Не удалось получить ID канала: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as { data: Array<{ id: string }> };
    const user = data.data[0];
    if (!user) {
      throw new Error(`Канал "${config.twitchChannel}" не найден`);
    }

    return user.id;
  }

  private async subscribeToChannelPointsRedemption(sessionId: string, broadcasterId: string | null): Promise<void> {
    if (!broadcasterId) {
      throw new Error('broadcasterId не определён');
    }

    const response = await fetch(`${HELIX_BASE_URL}/eventsub/subscriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.twitchOauthToken.replace(/^oauth:/, '')}`,
        'Client-Id': config.twitchClientId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'channel.channel_points_custom_reward_redemption.add',
        version: '1',
        condition: {
          broadcaster_user_id: broadcasterId,
          reward_id: config.rewardIdMusic,
        },
        transport: {
          method: 'websocket',
          session_id: sessionId,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Не удалось создать подписку: ${response.status} ${await response.text()}`);
    }
  }
}
