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

-- Leserspur (Technik-Auftrag 9): ein Datensatz pro Seitenaufruf, keine IP,
-- kein User-Agent. Wird vom Worker beim ersten Aufruf selbst angelegt.
CREATE TABLE IF NOT EXISTS leserspur (
  id TEXT PRIMARY KEY, ts INTEGER NOT NULL, tag TEXT NOT NULL, pfad TEXT NOT NULL,
  kanal TEXT, ref TEXT, ref_intern TEXT, geraet TEXT, sekunden INTEGER, scroll INTEGER,
  abschnitt_max INTEGER, abschnitt_ende INTEGER, abschnitte TEXT, bilder TEXT, klicks TEXT, formular TEXT
);
CREATE INDEX IF NOT EXISTS leserspur_ts ON leserspur(ts);

-- Newsletter-Anmeldungen (Technik-Auftrag 8): Nachweis der Einwilligung.
-- Wird vom Worker beim ersten Aufruf selbst angelegt.
CREATE TABLE IF NOT EXISTS newsletter_anmeldungen (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, email TEXT NOT NULL,
  ip TEXT, user_agent TEXT, quelle TEXT, einwilligung TEXT, ergebnis TEXT
);
CREATE INDEX IF NOT EXISTS newsletter_ip_ts ON newsletter_anmeldungen(ip, ts);
