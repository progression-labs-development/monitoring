ALTER TABLE incidents ADD COLUMN IF NOT EXISTS fingerprint TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_incidents_fingerprint_open
  ON incidents (fingerprint)
  WHERE status = 'open' AND fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_incidents_type ON incidents (type);
