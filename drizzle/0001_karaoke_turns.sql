CREATE TABLE karaoke_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room TEXT NOT NULL,
  singer_key TEXT NOT NULL,
  singer TEXT NOT NULL,
  track TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  ends_at INTEGER,
  performer_id TEXT,
  UNIQUE (room, singer_key)
);
--> statement-breakpoint
CREATE INDEX karaoke_turns_room_order ON karaoke_turns (room, id);
