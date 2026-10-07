# @tandem/engine

Pure TypeScript bughouse rules. No DOM, no network, no clocks (clocks live in the server, brief §6.2).

- `board.ts`: one board. Moves, drops, promotion (flagged), en passant, castling (incl. dropped-rook option), check, `boardStatus` = `ok | check | pending | mate | stuck`.
- `game.ts`: two boards + four reserves. `apply` validates, consumes drops, and transfers captures to the partner seat (colour preserved, promoted pieces become pawns). `result` ends the game on mate on either board.
- `fen.ts`: crazyhouse-style FEN with `[pockets]` and `~` promoted marks, for tests and fixtures.

Seats: A-w and B-b are one human's seats, A-b and B-w the other's.

## Verification (`npm test`)
- `oracle.test.ts`: perft and 300 random playouts against lichess `chessops` Crazyhouse (single-board legality). `droppedRookCastling: false` there because lichess forbids it.
- `bughouse.test.ts`: named scenarios for every rule in BRIEF §3 (transfer, counterfeits, drops, pending vs mate, no stalemate, dropped-rook castling).
- `property.test.ts`: 400 random two-board games asserting piece census conservation (32 per colour, promoted counted as pawns) and that every legal action applies.
- Mutation checked: nine deliberate rule breaks (pawn drops on rank 1/8, pending=mate, promoted capture keeps type, wrong transfer colour, dropped-rook flag ignored, no double step, no en passant, drops while in check, stalemate=mate) each make the suite fail.

Not here yet: clock layer, flags, draw/resign (server, M3).
