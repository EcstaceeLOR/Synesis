DROP TABLE IF EXISTS approval_decisions;
DROP TABLE IF EXISTS auth_sessions;
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;
DROP INDEX IF EXISTS users_provider_subject_unique;
ALTER TABLE users DROP COLUMN IF EXISTS auth_subject;
