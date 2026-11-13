CREATE TABLE party_meetings (
  id TEXT PRIMARY KEY,
  room TEXT NOT NULL,
  host TEXT NOT NULL,
  guest TEXT NOT NULL,
  accepted INTEGER NOT NULL DEFAULT 0,
  expires INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX party_meetings_host ON party_meetings (room, host);
--> statement-breakpoint
CREATE INDEX party_meetings_guest ON party_meetings (room, guest);
--> statement-breakpoint
ALTER TABLE party_signals ADD COLUMN channel TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE party_members ADD COLUMN backdrop TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE TABLE party_meeting_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting TEXT NOT NULL REFERENCES party_meetings(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  text TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX party_meeting_messages_room ON party_meeting_messages (meeting, id);
