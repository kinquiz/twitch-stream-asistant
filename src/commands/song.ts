import { Command } from './types';

export const songCommand: Command = {
  name: 'song',
  async execute({ queue, chat }, { channel }) {
    const current = queue.getCurrent();
    if (!current) {
      await chat.say(channel, 'Сейчас ничего не играет.');
      return;
    }

    await chat.say(channel, `Сейчас играет: ${current.query} (заказал ${current.requestedBy})`);
  },
};
