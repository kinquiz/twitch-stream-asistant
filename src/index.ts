import { config } from './config';
import { createLogger } from './logger';
import { TwitchChat } from './twitchChat';
import { EventSubClient } from './eventsub';
import { MusicQueue } from './musicQueue';
import { ConsoleMusicPlayer } from './musicPlayer';
import { dispatchCommand } from './commands';
import { CommandContext } from './commands/types';

const logger = createLogger('App');

async function main(): Promise<void> {
  const channel = `#${config.twitchChannel}`;

  const queue = new MusicQueue();
  const player = new ConsoleMusicPlayer();
  const chat = new TwitchChat();
  const eventSub = new EventSubClient();

  const commandContext: CommandContext = { queue, player, chat };

  chat.onMessage((msgChannel, user, message) => {
    void dispatchCommand(commandContext, msgChannel, user, message);
  });

  eventSub.onRewardRedemption((event) => {
    if (event.rewardId !== config.rewardIdMusic) return;

    const track = queue.add({
      query: event.userInput.trim(),
      requestedBy: event.userName,
    });

    logger.info(`Добавлен трек в очередь: "${track.query}" (заказал ${track.requestedBy})`);
    void chat.say(channel, `🎵 ${track.requestedBy} добавил(а) в очередь: ${track.query}`);

    if (!queue.getCurrent()) {
      const current = queue.advance();
      if (current) {
        void player.play(current);
      }
    }
  });

  await chat.connect();
  eventSub.start();

  logger.info('Бот запущен и готов к работе');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Получен сигнал ${signal}, завершаю работу...`);
    eventSub.stop();
    await chat.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.error('Не удалось запустить бота', error);
  process.exit(1);
});
