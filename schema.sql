-- Aristotl.es live tools — database schema (Cloudflare D1)
-- Paste this whole file into the D1 console once ("Console" tab of your database).

CREATE TABLE IF NOT EXISTS sessions (
  code               TEXT PRIMARY KEY,          -- short code shown on the projector, e.g. "K7QM"
  title              TEXT NOT NULL,
  technique          TEXT,                      -- slug of the technique of the week
  current_speech_id  TEXT,
  timer_end          INTEGER,                   -- speech timer: absolute end time in ms (NULL = stopped)
  timer_duration     INTEGER,                   -- speech timer length in seconds
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS speeches (
  id            TEXT PRIMARY KEY,
  session_code  TEXT NOT NULL REFERENCES sessions(code) ON DELETE CASCADE,
  speaker       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'waiting',  -- waiting | open | closed
  result_token  TEXT NOT NULL,                    -- secret that lets the speaker see their card
  film          INTEGER NOT NULL DEFAULT 0,       -- 1 = speaker agreed to be filmed
  youtube_id    TEXT,                             -- unlisted video on the host's channel
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_speeches_session ON speeches(session_code);

CREATE TABLE IF NOT EXISTS votes (
  speech_id   TEXT NOT NULL REFERENCES speeches(id) ON DELETE CASCADE,
  voter       TEXT NOT NULL,                      -- random id kept on the voter's phone
  ethos       INTEGER NOT NULL CHECK (ethos BETWEEN 1 AND 5),
  pathos      INTEGER NOT NULL CHECK (pathos BETWEEN 1 AND 5),
  logos       INTEGER NOT NULL CHECK (logos BETWEEN 1 AND 5),
  structure   INTEGER NOT NULL CHECK (structure BETWEEN 1 AND 5),
  delivery    INTEGER NOT NULL CHECK (delivery BETWEEN 1 AND 5),
  worked      TEXT,
  next_rep    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (speech_id, voter)
);

CREATE TABLE IF NOT EXISTS passports (
  id          TEXT PRIMARY KEY,
  secret      TEXT NOT NULL,
  name        TEXT NOT NULL,
  profile     TEXT,                               -- speaker profile id from the quiz, e.g. "rambler"
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS passport_speeches (
  passport_id  TEXT NOT NULL REFERENCES passports(id) ON DELETE CASCADE,
  speech_id    TEXT NOT NULL REFERENCES speeches(id) ON DELETE CASCADE,
  added_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (passport_id, speech_id)
);

CREATE TABLE IF NOT EXISTS filler_counts (
  speech_id   TEXT NOT NULL REFERENCES speeches(id) ON DELETE CASCADE,
  counter     TEXT NOT NULL,                      -- random id kept on the counter's phone
  count       INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (speech_id, counter)
);

CREATE TABLE IF NOT EXISTS self_ratings (speech_id TEXT PRIMARY KEY REFERENCES speeches(id) ON DELETE CASCADE, ethos INTEGER NOT NULL, pathos INTEGER NOT NULL, logos INTEGER NOT NULL, structure INTEGER NOT NULL, delivery INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS oauth_states (state TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, speech_id TEXT NOT NULL REFERENCES speeches(id) ON DELETE CASCADE, upload_url TEXT NOT NULL, size INTEGER NOT NULL, mime TEXT NOT NULL, received INTEGER NOT NULL DEFAULT 0, youtube_id TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS participants (id TEXT PRIMARY KEY, session_code TEXT NOT NULL REFERENCES sessions(code) ON DELETE CASCADE, name TEXT NOT NULL, secret TEXT NOT NULL, ord REAL NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_participants_session ON participants(session_code);
ALTER TABLE speeches ADD COLUMN participant_id TEXT;
ALTER TABLE speeches ADD COLUMN filmer TEXT;
ALTER TABLE sessions ADD COLUMN camera_mode TEXT NOT NULL DEFAULT 'rotation';
ALTER TABLE sessions ADD COLUMN camera_person TEXT;
