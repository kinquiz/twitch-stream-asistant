import { Command } from './types';

export const queueCommand: Command = {
  name: 'queue',
  async execute({ queue, chat }, { channel }) {
    const tracks = queue.getQueue();
    if (tracks.length === 0) {
      await chat.say(channel, 'Очередь музыки пуста.');
      return;
    }

    const list = tracks
      .slice(0, 5)
      .map((track, index) => `${index + 1}) ${track.query} (от ${track.requestedBy})`)
      .join(' | ');

    const rest = tracks.length > 5 ? ` и ещё ${tracks.length - 5}` : '';
    await chat.say(channel, `Очередь музыки: ${list}${rest}`);
  },
};
