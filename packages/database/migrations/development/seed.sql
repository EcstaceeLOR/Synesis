-- DEVELOPMENT-ONLY fixtures. The CLI refuses to run this seed in live mode.
INSERT INTO users (id, email, auth_provider, auth_subject)
VALUES (
  'dev_user_operator',
  'operator@synesis.local',
  'development',
  'dev-user-operator'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, name, environment)
VALUES ('dev_org_synesis', 'Synesis Development', 'demo')
ON CONFLICT (id) DO NOTHING;

INSERT INTO memberships (organization_id, user_id, role)
VALUES ('dev_org_synesis', 'dev_user_operator', 'owner')
ON CONFLICT (organization_id, user_id) DO NOTHING;

INSERT INTO integration_connections (
  id, organization_id, integration_type, encrypted_secret_ref, health
)
VALUES (
  'dev_connection_keeperhub',
  'dev_org_synesis',
  'keeperhub',
  'vault://development/synesis/keeperhub',
  'healthy'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO policy_versions (
  id, organization_id, name, version, canonical_policy, policy_hash, activated_at
)
VALUES (
  'dev_policy_guardrails_v1',
  'dev_org_synesis',
  'Default Guardrails',
  1,
  '{"maxValue":"1000000","requireSimulation":true}'::jsonb,
  'sha256:dev-policy-guardrails-v1',
  now()
)
ON CONFLICT (id) DO NOTHING;
