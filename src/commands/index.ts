import { createLogger } from '../logger';
import { ChatUser } from '../twitchChat';
import { Command, CommandContext } from './types';
import { queueCommand } from './queue';
import { skipCommand } from './skip';
import { songCommand } from './song';

const logger = createLogger('Commands');

const COMMAND_PREFIX = '!';

const commands: readonly Command[] = [queueCommand, skipCommand, songCommand];

const commandsByName = new Map<string, Command>(commands.map((command) => [command.name, command]));

function parseCommand(message: string): { name: string; args: string[] } | null {
  if (!message.startsWith(COMMAND_PREFIX)) return null;

  const [rawName, ...args] = message.slice(COMMAND_PREFIX.length).trim().split(/\s+/);
  if (!rawName) return null;

  return { name: rawName.toLowerCase(), args };
}

export async function dispatchCommand(
  ctx: CommandContext,
  channel: string,
  user: ChatUser,
  message: string,
): Promise<void> {
  const parsed = parseCommand(message);
  if (!parsed) return;

  const command = commandsByName.get(parsed.name);
  if (!command) return;

  if (command.modOnly && !user.isMod && !user.isBroadcaster) {
    await ctx.chat.say(channel, `@${user.username}, эта команда доступна только модераторам.`);
    return;
  }

  try {
    await command.execute(ctx, { channel, user, args: parsed.args });
  } catch (error) {
    logger.error(`Ошибка при выполнении команды "${command.name}"`, error);
  }
}
