CREATE TABLE IF NOT EXISTS incidents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain            TEXT NOT NULL,
  type              TEXT NOT NULL,
  severity          TEXT NOT NULL,
  observed          JSONB NOT NULL DEFAULT '{}',
  expected          JSONB NOT NULL DEFAULT '{}',
  delta             JSONB NOT NULL DEFAULT '{}',
  resource          JSONB NOT NULL DEFAULT '{}',
  actor             JSONB NOT NULL DEFAULT '{}',
  permitted_actions TEXT[] NOT NULL DEFAULT '{}',
  constraints       JSONB NOT NULL DEFAULT '{}',
  status            TEXT NOT NULL DEFAULT 'open',
  claimed_by        TEXT,
  outcome           JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at        TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_incidents_status_severity ON incidents (status, severity);
CREATE INDEX IF NOT EXISTS idx_incidents_domain ON incidents (domain);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents (created_at DESC);
