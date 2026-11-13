CREATE TABLE party_backdrops (
  member_id TEXT PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  image TEXT NOT NULL
);
