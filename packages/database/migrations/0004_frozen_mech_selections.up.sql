ALTER TABLE intent_mechs
  ADD COLUMN metadata_cid text NOT NULL,
  ADD COLUMN tool_schema_hash text NOT NULL,
  ADD COLUMN observed_version text NOT NULL,
  ADD COLUMN observed_at timestamptz NOT NULL;

ALTER TABLE intent_mechs
  ADD CONSTRAINT intent_mechs_metadata_cid_check CHECK (metadata_cid ~ '^f[0-9a-f]+$'),
  ADD CONSTRAINT intent_mechs_schema_hash_check CHECK (tool_schema_hash ~ '^sha256:[0-9a-f]{64}$');
