-- Kommentare für die Journal-Stories
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT    NOT NULL,
  name       TEXT    NOT NULL,
  email      TEXT,                       -- optional, wird NICHT öffentlich angezeigt
  body       TEXT    NOT NULL,
  created_at INTEGER NOT NULL,           -- Unix-ms
  approved   INTEGER NOT NULL DEFAULT 1, -- 1 = sichtbar; auf 0 setzen für Moderation
  parent_id  INTEGER                     -- Antwort auf Kommentar-ID (NULL = auf den Artikel)
);

CREATE INDEX IF NOT EXISTS idx_comments_slug
  ON comments (slug, approved, created_at);

-- Kontaktanfragen
CREATE TABLE IF NOT EXISTS contacts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  email      TEXT    NOT NULL,
  message    TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);
