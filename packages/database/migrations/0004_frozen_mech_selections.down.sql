ALTER TABLE intent_mechs
  DROP CONSTRAINT IF EXISTS intent_mechs_schema_hash_check,
  DROP CONSTRAINT IF EXISTS intent_mechs_metadata_cid_check,
  DROP COLUMN IF EXISTS observed_at,
  DROP COLUMN IF EXISTS observed_version,
  DROP COLUMN IF EXISTS tool_schema_hash,
  DROP COLUMN IF EXISTS metadata_cid;
