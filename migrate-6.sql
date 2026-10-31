ALTER TABLE speeches ADD COLUMN focus_roles TEXT;
ALTER TABLE speeches ADD COLUMN parent_id TEXT;
ALTER TABLE speeches ADD COLUMN kind TEXT;
ALTER TABLE speeches ADD COLUMN seconds INTEGER;
ALTER TABLE votes ADD COLUMN focus INTEGER;
CREATE TABLE IF NOT EXISTS role_reports (speech_id TEXT NOT NULL REFERENCES speeches(id) ON DELETE CASCADE, voter TEXT NOT NULL, role TEXT NOT NULL, data TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (speech_id, voter, role));
