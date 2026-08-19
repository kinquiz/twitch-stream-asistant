import { MusicQueue } from '../musicQueue';
import { MusicPlayer } from '../musicPlayer';
import { ChatUser, TwitchChat } from '../twitchChat';

export interface CommandContext {
  queue: MusicQueue;
  player: MusicPlayer;
  chat: TwitchChat;
}

export interface CommandInvocation {
  channel: string;
  user: ChatUser;
  args: string[];
}

export interface Command {
  name: string;
  modOnly?: boolean;
  execute(ctx: CommandContext, invocation: CommandInvocation): Promise<void> | void;
}
