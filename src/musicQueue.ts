export interface Track {
  id: string;
  query: string;
  requestedBy: string;
  requestedAt: Date;
}

export type NewTrack = Omit<Track, 'id' | 'requestedAt'>;

let trackCounter = 0;

function nextTrackId(): string {
  trackCounter += 1;
  return `track-${trackCounter}`;
}

export class MusicQueue {
  private tracks: Track[] = [];
  private current: Track | null = null;

  add(track: NewTrack): Track {
    const fullTrack: Track = {
      id: nextTrackId(),
      query: track.query,
      requestedBy: track.requestedBy,
      requestedAt: new Date(),
    };
    this.tracks.push(fullTrack);
    return fullTrack;
  }

  /** Снимает текущий трек с проигрывания и достаёт следующий из очереди. */
  advance(): Track | null {
    this.current = this.tracks.shift() ?? null;
    return this.current;
  }

  getCurrent(): Track | null {
    return this.current;
  }

  getQueue(): readonly Track[] {
    return this.tracks;
  }

  isEmpty(): boolean {
    return this.tracks.length === 0;
  }

  clear(): void {
    this.tracks = [];
    this.current = null;
  }
}
