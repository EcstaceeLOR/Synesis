CREATE TABLE outbox_messages (
  id text PRIMARY KEY,
  topic text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  message_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  trace_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'dispatching', 'published', 'dead')
  ),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  published_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'dispatching' AND locked_at IS NOT NULL AND locked_by IS NOT NULL)
    OR status <> 'dispatching'
  )
);

CREATE INDEX outbox_messages_dispatch_idx
  ON outbox_messages (available_at, created_at)
  WHERE status = 'pending';

CREATE INDEX outbox_messages_lease_idx
  ON outbox_messages (locked_at)
  WHERE status = 'dispatching';

CREATE INDEX outbox_messages_aggregate_idx
  ON outbox_messages (aggregate_type, aggregate_id, created_at);
