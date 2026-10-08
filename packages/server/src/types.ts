// Wire and room types shared by the server adapters and the client (BRIEF §6.4).
import type { Board, BoardStatus, Color } from '@tandem/engine';

export type Team = 'WA' | 'BA';
export type SeatId = 'A-w' | 'A-b' | 'B-w' | 'B-b';

export const SEATS: SeatId[] = ['A-w', 'A-b', 'B-w', 'B-b'];
/** Team White-A holds White on A and Black on B; Team Black-A holds the mirror. */
export const TEAM_SEATS: Record<Team, [SeatId, SeatId]> = { WA: ['A-w', 'B-b'], BA: ['A-b', 'B-w'] };
export const seatOf = (team: Team, board: Board): SeatId =>
  TEAM_SEATS[team].find(s => s[0] === board)!;
export const seatBoard = (s: SeatId): Board => s[0] as Board;
export const seatColor = (s: SeatId): Color => s[2] as Color;
export const seatTeam = (s: SeatId): Team => (TEAM_SEATS.WA.includes(s) ? 'WA' : 'BA');
export const otherTeam = (t: Team): Team => (t === 'WA' ? 'BA' : 'WA');
export const teamLabel = (t: Team): string => (t === 'WA' ? 'White-A' : 'Black-A');

export interface TimeControl { baseMin: number; incSec: number }
export const DEFAULT_TC: TimeControl = { baseMin: 5, incSec: 0 };
export const TC_PRESETS: TimeControl[] = [
  { baseMin: 1, incSec: 0 }, { baseMin: 2, incSec: 0 }, { baseMin: 3, incSec: 0 },
  { baseMin: 5, incSec: 0 }, { baseMin: 10, incSec: 0 }, { baseMin: 3, incSec: 2 },
];
export const tcLabel = (tc: TimeControl) => `${tc.baseMin}+${tc.incSec}`;

export type Phase = 'setup' | 'countdown' | 'playing' | 'over';

export type EndReason =
  | 'mate' | 'flag' | 'resign' | 'draw-agreed' | 'draw-flags' | 'abandon' | 'abort' | 'void';

export interface Result {
  /** null winner with reason 'abort' or 'void' means no game; with a draw reason it means a drawn game. */
  winner: Team | null;
  reason: EndReason;
  /** The board the deciding event happened on, when there is one. */
  board?: Board;
  /** One plain sentence, as shown on the result screen (BRIEF §7.6). */
  text: string;
}

export interface PlyRecord {
  n: number;
  board: Board;
  color: Color;
  san: string;
  /** Serialised action, so a replay can reconstruct without re-deriving from SAN. */
  action: { kind: 'move'; from: number; to: number; promo?: string } | { kind: 'drop'; piece: string; to: number };
  serverTs: number;
  /** Clocks immediately after the action, keyed by seat. */
  clocks: Record<SeatId, number>;
  /** FENs after the action (both boards: a capture changes the other board's reserve). */
  fen: Record<Board, string>;
  /** Piece transferred to the partner seat, if any. */
  transfer?: { toBoard: Board; color: Color; piece: string };
}

export interface PublicPlayer { name: string; connected: boolean }

export interface RoomSnapshot {
  id: string;
  phase: Phase;
  tc: TimeControl;
  /** Epoch ms when the countdown ends and clocks start. */
  startAt: number | null;
  players: Record<Team, PublicPlayer | null>;
  ready: Record<Team, boolean>;
  spectators: number;
  fen: Record<Board, string>;
  status: Record<Board, BoardStatus>;
  turn: Record<Board, Color>;
  clocks: Record<SeatId, number>;
  /** Server time the clocks were settled at; clients interpolate from here. */
  clocksAt: number;
  running: SeatId[];
  lowTimeMs: number;
  ply: PlyRecord[];
  result: Result | null;
  drawOffer: { by: Team; until: number } | null;
  rematch: { by: Team; until: number } | null;
  /** Set when the opponent has been disconnected long enough to claim (BRIEF §6.5). */
  claimable: Record<Team, boolean>;
  /** The host's team preference, resolved to a seat at the start of the game. */
  hostTeam: Team | 'random';
  /** Which team currently holds the host role, so the client knows whose controls to show. */
  host: Team | null;
}

export type ClientMsg =
  | { type: 'join'; name?: string; seatToken?: string; spectate?: boolean }
  | { type: 'setup'; tc?: TimeControl; team?: Team | 'random' }
  | { type: 'ready'; value: boolean }
  | { type: 'rename'; name: string }
  | { type: 'action'; board: Board; action: { kind: 'move'; from: number; to: number; promo?: string } | { kind: 'drop'; piece: string; to: number } }
  | { type: 'resign' }
  | { type: 'drawOffer' }
  | { type: 'drawAccept' }
  | { type: 'drawDecline' }
  | { type: 'rematch' }
  | { type: 'claimWin' }
  | { type: 'resync' }
  | { type: 'ping'; t: number };

export type ServerMsg =
  /** Per-connection, so it carries no seq: seq numbers only order the broadcast stream. */
  | { type: 'joined'; team: Team | null; seatToken?: string; name: string }
  | { type: 'snapshot'; seq: number; serverTs: number; room: RoomSnapshot }
  | { type: 'action'; seq: number; serverTs: number; ply: PlyRecord; clocksAt: number; running: SeatId[]; status: Record<Board, BoardStatus> }
  | { type: 'reject'; reason: string }
  | { type: 'ended'; seq: number; serverTs: number; result: Result; room: RoomSnapshot }
  | { type: 'presence'; seq: number; team: Team; connected: boolean }
  | { type: 'pong'; t: number; serverTs: number };
