-- Notification Preferences Service: initial schema.

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id      TEXT PRIMARY KEY,
    quiet_hours  JSONB,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_preference_items (
    user_id            TEXT NOT NULL REFERENCES user_preferences(user_id) ON DELETE CASCADE,
    notification_type  TEXT NOT NULL,
    channel            TEXT NOT NULL,
    enabled            BOOLEAN NOT NULL,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, notification_type, channel)
);

CREATE INDEX IF NOT EXISTS idx_user_pref_items_user
    ON user_preference_items(user_id);

CREATE TABLE IF NOT EXISTS global_policies (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_type  TEXT,
    channel            TEXT,
    region             TEXT,
    effect             TEXT NOT NULL CHECK (effect IN ('deny')),
    reason             TEXT NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_global_policies_lookup
    ON global_policies (notification_type, channel, region);

-- Idempotency for preference updates. The same (user, key) replay is a no-op.
CREATE TABLE IF NOT EXISTS preference_change_log (
    id              BIGSERIAL PRIMARY KEY,
    user_id         TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    applied_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    payload         JSONB NOT NULL,
    UNIQUE (user_id, idempotency_key)
);

-- gen_random_uuid() requires pgcrypto on older PG; PG 13+ has it built in via pgcrypto.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
