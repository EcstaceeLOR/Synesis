DROP TABLE IF EXISTS integration_health_checks;
DROP TABLE IF EXISTS integration_secrets;
ALTER TABLE organizations
  DROP COLUMN IF EXISTS integrations_ready_at,
  DROP COLUMN IF EXISTS integration_status;
