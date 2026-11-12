CREATE TABLE party_members (
  id TEXT PRIMARY KEY,
  room TEXT NOT NULL,
  token TEXT NOT NULL,
  name TEXT NOT NULL,
  camera INTEGER NOT NULL DEFAULT 0,
  mic INTEGER NOT NULL DEFAULT 0,
  seen INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX party_members_room ON party_members (room, seen);
--> statement-breakpoint
CREATE TABLE party_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender TEXT NOT NULL,
  target TEXT NOT NULL,
  nonce TEXT NOT NULL,
  payload TEXT NOT NULL,
  created INTEGER NOT NULL,
  UNIQUE (sender, nonce)
);
--> statement-breakpoint
CREATE INDEX party_signals_target ON party_signals (target, id);
