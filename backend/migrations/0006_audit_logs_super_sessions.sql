-- 0006: superkutut audit log + super session flag
CREATE TABLE IF NOT EXISTS audit_logs (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_id    BIGINT,
    actor_email TEXT,
    actor_role  TEXT,
    ip          TEXT,
    user_agent  TEXT,
    category    TEXT NOT NULL,
    action      TEXT NOT NULL,
    target_type TEXT,
    target_id   TEXT,
    detail      JSONB NOT NULL DEFAULT '{}',
    outcome     TEXT NOT NULL DEFAULT 'ok',
    method      TEXT,
    path        TEXT,
    status      INT,
    duration_ms INT
);
CREATE INDEX IF NOT EXISTS audit_logs_ts_idx ON audit_logs (ts DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs (actor_id, ts DESC);
CREATE INDEX IF NOT EXISTS audit_logs_cat_idx ON audit_logs (category, action, ts DESC);

-- Super session reuse tabel sessions: penanda agar cookie super tidak berlaku
-- di portal biasa dan sebaliknya.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_super BOOLEAN NOT NULL DEFAULT FALSE;
