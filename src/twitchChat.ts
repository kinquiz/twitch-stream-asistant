import tmi from 'tmi.js';
import { config } from './config';
import { createLogger } from './logger';

const logger = createLogger('TwitchChat');

export interface ChatUser {
  username: string;
  isMod: boolean;
  isBroadcaster: boolean;
}

export type ChatMessageHandler = (channel: string, user: ChatUser, message: string) => void;

/** Тонкая обёртка над tmi.js: подключение к чату, отправка сообщений, подписка на входящие. */
export class TwitchChat {
  private readonly client: tmi.Client;
  private messageHandler: ChatMessageHandler | null = null;

  constructor() {
    this.client = new tmi.Client({
      options: { debug: false },
      connection: {
        reconnect: true,
        secure: true,
      },
      identity: {
        username: config.twitchBotUsername,
        password: config.twitchOauthToken,
      },
      channels: [config.twitchChannel],
    });

    this.client.on('connected', (address, port) => {
      logger.info(`Подключено к чату Twitch (${address}:${port})`);
    });

    this.client.on('disconnected', (reason) => {
      logger.warn(`Отключено от чата Twitch: ${reason}`);
    });

    this.client.on('reconnect', () => {
      logger.info('Переподключение к чату Twitch...');
    });

    this.client.on('message', (channel, tags, message, self) => {
      if (self) return;
      if (!this.messageHandler) return;

      const user: ChatUser = {
        username: tags.username ?? tags['display-name'] ?? 'unknown',
        isMod: tags.mod === true || tags.badges?.broadcaster === '1',
        isBroadcaster: tags.badges?.broadcaster === '1',
      };

      this.messageHandler(channel, user, message);
    });
  }

  onMessage(handler: ChatMessageHandler): void {
    this.messageHandler = handler;
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }

  async say(channel: string, message: string): Promise<void> {
    try {
      await this.client.say(channel, message);
    } catch (error) {
      logger.error('Не удалось отправить сообщение в чат', error);
    }
  }
}
