ALTER TABLE users ADD COLUMN auth_subject text;
UPDATE users SET auth_subject = 'legacy:' || id WHERE auth_subject IS NULL;
ALTER TABLE users ALTER COLUMN auth_subject SET NOT NULL;
CREATE UNIQUE INDEX users_provider_subject_unique
  ON users (auth_provider, auth_subject);

ALTER TABLE memberships
  ADD CONSTRAINT memberships_role_check
  CHECK (role IN ('viewer', 'operator', 'approver', 'owner'));

CREATE TABLE auth_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  csrf_token_hash text NOT NULL,
  authenticated_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_sessions_expiry_check CHECK (expires_at > created_at)
);

CREATE INDEX auth_sessions_active_user_idx
  ON auth_sessions (user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX auth_sessions_expiry_idx
  ON auth_sessions (expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE approval_decisions (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  intent_id text NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decision text NOT NULL CONSTRAINT approval_decisions_decision_check
    CHECK (decision IN ('approve', 'reject')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX approval_decisions_intent_user_unique
  ON approval_decisions (intent_id, user_id);
CREATE INDEX approval_decisions_org_created_idx
  ON approval_decisions (organization_id, created_at);
