CREATE TABLE IF NOT EXISTS participants (id TEXT PRIMARY KEY, session_code TEXT NOT NULL REFERENCES sessions(code) ON DELETE CASCADE, name TEXT NOT NULL, secret TEXT NOT NULL, ord REAL NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_participants_session ON participants(session_code);
ALTER TABLE speeches ADD COLUMN participant_id TEXT;
ALTER TABLE speeches ADD COLUMN filmer TEXT;
ALTER TABLE sessions ADD COLUMN camera_mode TEXT NOT NULL DEFAULT 'rotation';
ALTER TABLE sessions ADD COLUMN camera_person TEXT;
