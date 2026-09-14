ALTER TABLE organizations
  ADD COLUMN integration_status text NOT NULL DEFAULT 'NOT_READY'
    CONSTRAINT organizations_integration_status_check CHECK (integration_status IN ('NOT_READY', 'READY')),
  ADD COLUMN integrations_ready_at timestamptz;

CREATE TABLE integration_secrets (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_type text NOT NULL,
  ciphertext text NOT NULL,
  initialization_vector text NOT NULL,
  authentication_tag text NOT NULL,
  key_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX integration_secrets_org_type_unique
  ON integration_secrets (organization_id, integration_type);

CREATE TABLE integration_health_checks (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  component text NOT NULL,
  status text NOT NULL CONSTRAINT integration_health_checks_status_check
    CHECK (status IN ('ready', 'failed', 'unconfigured')),
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  duration_ms integer NOT NULL CONSTRAINT integration_health_checks_duration_check CHECK (duration_ms >= 0),
  checked_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX integration_health_checks_org_component_unique
  ON integration_health_checks (organization_id, component);
