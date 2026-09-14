CREATE TABLE users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  auth_provider text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organizations (
  id text PRIMARY KEY,
  name text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('demo', 'live')),
  paused_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE integration_connections (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_type text NOT NULL,
  encrypted_secret_ref text NOT NULL CHECK (encrypted_secret_ref ~ '^(vault|kms|secret-manager)://'),
  health text NOT NULL DEFAULT 'unknown',
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX integration_connections_org_type_unique ON integration_connections (organization_id, integration_type);

CREATE TABLE wallet_snapshots (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  wallet_address text NOT NULL,
  chain_id integer NOT NULL,
  eth_balance numeric(78, 0) NOT NULL,
  usdc_balance numeric(78, 0) NOT NULL,
  block_number bigint NOT NULL,
  captured_at timestamptz NOT NULL
);
CREATE INDEX wallet_snapshots_org_captured_idx ON wallet_snapshots (organization_id, captured_at);

CREATE TABLE mechs (
  id text PRIMARY KEY,
  chain_id integer NOT NULL,
  address text NOT NULL,
  service_id text NOT NULL,
  payment_type text NOT NULL,
  metadata_cid text,
  status text NOT NULL,
  observed_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX mechs_chain_address_unique ON mechs (chain_id, address);

CREATE TABLE mech_tool_versions (
  id text PRIMARY KEY,
  mech_id text NOT NULL REFERENCES mechs(id) ON DELETE CASCADE,
  tool_id text NOT NULL,
  input_schema jsonb NOT NULL,
  output_schema jsonb NOT NULL,
  schema_hash text NOT NULL,
  observed_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX mech_tool_versions_unique ON mech_tool_versions (mech_id, tool_id, schema_hash);

CREATE TABLE policy_versions (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  canonical_policy jsonb NOT NULL,
  policy_hash text NOT NULL,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX policy_versions_org_name_version_unique ON policy_versions (organization_id, name, version);

CREATE TABLE intents (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  state text NOT NULL,
  state_version integer NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  strategy text NOT NULL,
  amount numeric(78, 0) NOT NULL CHECK (amount > 0),
  chain_id integer NOT NULL,
  snapshot_hash text NOT NULL,
  policy_version_id text NOT NULL REFERENCES policy_versions(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intents_org_created_idx ON intents (organization_id, created_at);

CREATE TABLE intent_mechs (
  id text PRIMARY KEY,
  intent_id text NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  mech_id text NOT NULL REFERENCES mechs(id),
  tool_id text NOT NULL,
  quoted_price numeric(78, 0) NOT NULL,
  request_cid text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX intent_mechs_intent_mech_unique ON intent_mechs (intent_id, mech_id);

CREATE TABLE keeperhub_executions (
  id text PRIMARY KEY,
  intent_id text NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  idempotency_key text NOT NULL,
  execution_id text,
  simulation_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  economic_success boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT economic_success OR status = 'completed')
);
CREATE UNIQUE INDEX keeperhub_executions_idempotency_unique ON keeperhub_executions (idempotency_key);
CREATE UNIQUE INDEX keeperhub_executions_execution_id_unique ON keeperhub_executions (execution_id);
CREATE UNIQUE INDEX keeperhub_executions_successful_purpose_unique ON keeperhub_executions (intent_id, purpose) WHERE economic_success = true;

CREATE TABLE olas_requests (
  id text PRIMARY KEY,
  intent_mech_id text NOT NULL REFERENCES intent_mechs(id) ON DELETE CASCADE,
  chain_id integer NOT NULL,
  request_id text NOT NULL,
  keeperhub_execution_id text REFERENCES keeperhub_executions(id),
  transaction_hash text,
  state text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX olas_requests_chain_request_unique ON olas_requests (chain_id, request_id);

CREATE TABLE deliveries (
  id text PRIMARY KEY,
  olas_request_id text NOT NULL REFERENCES olas_requests(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  block_number bigint NOT NULL,
  transaction_hash text NOT NULL,
  result_cid text NOT NULL,
  result_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX deliveries_request_event_unique ON deliveries (olas_request_id, event_key);

CREATE TABLE recommendations (
  id text PRIMARY KEY,
  delivery_id text NOT NULL UNIQUE REFERENCES deliveries(id) ON DELETE CASCADE,
  normalized_payload jsonb NOT NULL,
  validation_status text NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE policy_evaluations (
  id text PRIMARY KEY,
  intent_id text NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  policy_version_id text NOT NULL REFERENCES policy_versions(id),
  input_hash text NOT NULL,
  result text NOT NULL,
  rule_results jsonb NOT NULL,
  output_hash text NOT NULL,
  evaluated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX policy_evaluations_intent_output_unique ON policy_evaluations (intent_id, output_hash);

CREATE TABLE execution_plans (
  id text PRIMARY KEY,
  intent_id text NOT NULL UNIQUE REFERENCES intents(id) ON DELETE CASCADE,
  target text NOT NULL,
  function_name text NOT NULL,
  arguments jsonb NOT NULL,
  abi_hash text NOT NULL,
  value numeric(78, 0) NOT NULL,
  plan_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE transaction_receipts (
  id text PRIMARY KEY,
  keeperhub_execution_id text NOT NULL UNIQUE REFERENCES keeperhub_executions(id) ON DELETE CASCADE,
  transaction_hash text UNIQUE,
  block_number bigint,
  status text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  raw_receipt_hash text NOT NULL,
  observed_at timestamptz NOT NULL
);

CREATE TABLE event_inbox (
  id text PRIMARY KEY,
  source text NOT NULL,
  event_key text NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'received',
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE UNIQUE INDEX event_inbox_source_event_unique ON event_inbox (source, event_key);

CREATE TABLE audit_events (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  intent_id text REFERENCES intents(id) ON DELETE CASCADE,
  actor jsonb NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  before_hash text,
  after_hash text,
  trace_id text NOT NULL,
  reason text,
  transition_from text,
  transition_to text,
  intent_state_version integer,
  is_terminal_transition boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL
);
CREATE INDEX audit_events_intent_occurred_idx ON audit_events (intent_id, occurred_at);
CREATE UNIQUE INDEX audit_events_terminal_transition_unique ON audit_events (intent_id, intent_state_version) WHERE is_terminal_transition = true;

CREATE TABLE proof_bundles (
  id text PRIMARY KEY,
  intent_id text NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  public_id text NOT NULL UNIQUE,
  canonical_bundle jsonb NOT NULL,
  root_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX proof_bundles_intent_root_unique ON proof_bundles (intent_id, root_hash);
