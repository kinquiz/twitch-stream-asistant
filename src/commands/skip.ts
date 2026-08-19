import { Command } from './types';

export const skipCommand: Command = {
  name: 'skip',
  modOnly: true,
  async execute({ queue, player, chat }, { channel }) {
    const next = queue.advance();

    if (!next) {
      await player.stop();
      await chat.say(channel, 'Трек пропущен. Очередь пуста.');
      return;
    }

    await player.play(next);
    await chat.say(channel, `Трек пропущен. Сейчас играет: ${next.query}`);
  },
};
