// Finished-game persistence for the replay route (BRIEF §4.1 item 6, §6.1). 90-day retention.
import type { Board } from '@tandem/engine';
import type { PlyRecord, Result, Team, TimeControl } from './types.ts';

export interface GameRecord {
  id: string;
  endedAt: number;
  startedAt: number;
  tc: TimeControl;
  players: Record<Team, string>;
  result: Result;
  ply: PlyRecord[];
  finalFen: Record<Board, string>;
}

export interface GameStore {
  put(rec: GameRecord): Promise<void>;
  get(id: string): Promise<GameRecord | null>;
}

export const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export class MemoryStore implements GameStore {
  private m = new Map<string, GameRecord>();
  async put(rec: GameRecord) { this.m.set(rec.id, rec); }
  async get(id: string) {
    const r = this.m.get(id) ?? null;
    if (r && Date.now() - r.endedAt > RETENTION_MS) { this.m.delete(id); return null; }
    return r;
  }
}
