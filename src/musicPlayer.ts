import { Track } from './musicQueue';
import { createLogger } from './logger';

/**
 * Абстракция над проигрывателем музыки. Реальная интеграция со Spotify/YouTube
 * добавляется позже — сейчас достаточно реализации, которая просто логирует.
 */
export interface MusicPlayer {
  play(track: Track): Promise<void>;
  stop(): Promise<void>;
}

export class ConsoleMusicPlayer implements MusicPlayer {
  private readonly logger = createLogger('MusicPlayer');

  async play(track: Track): Promise<void> {
    this.logger.info(`Играет трек: "${track.query}" (заказал ${track.requestedBy})`);
  }

  async stop(): Promise<void> {
    this.logger.info('Воспроизведение остановлено');
  }
}
