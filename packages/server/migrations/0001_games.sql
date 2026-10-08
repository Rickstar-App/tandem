-- Finished games for the replay route (BRIEF §4.1 item 6, §6.1). Retention is 90 days;
-- D1Store.put deletes rows past that on every write, so no scheduled job is needed.
CREATE TABLE IF NOT EXISTS games (
  id       TEXT PRIMARY KEY,
  ended_at INTEGER NOT NULL,
  body     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS games_ended_at ON games (ended_at);
