# Deployment

Synesis ships as separate web, API, worker, and Olas adapter containers with
PostgreSQL and Redis on a private network. The Compose file is the canonical
local and preview topology; production should use managed PostgreSQL/Redis and
an encrypted secret store with the same service contracts.

## Local stack

```powershell
Copy-Item deploy/.env.example .env
docker compose -f deploy/compose.yaml up --build
```

Open `http://localhost:3000`. The API health endpoint is available at
`http://localhost:4000/health`. Database migrations run as a one-shot service
before the API and worker become healthy. Stop the stack with
`docker compose -f deploy/compose.yaml down`; add `-v` only when intentionally
removing the local Postgres and Redis volumes.

The default `SYNESIS_MODE=demo` cannot broadcast value movement. Every service
uses `deploy/entrypoint.sh`; changing to `SYNESIS_MODE=live` fails closed unless
`SYNESIS_LIVE_ACKNOWLEDGED=I_UNDERSTAND_LIVE_VALUE_MOVEMENT` is explicitly set.
Live mode additionally requires rotated adapter tokens, a real organization
wallet, and a private Base RPC as validated by the adapter configuration.

## Hosted environments

- Preview uses isolated databases, Redis, adapter tokens, and KeeperHub
  credentials. It must never receive production secrets or a production wallet.
- Production runs the API, worker, and adapter on private service networking;
  expose only web and the API health/read endpoints through the edge. Configure
  encrypted secrets, TLS, automated Postgres backups/PITR, Redis persistence,
  health checks, and image rollback to the previous immutable digest.
- The `Deploy` workflow is manual. Its `production` environment is intentionally
  protected by GitHub environment reviewers; configure the required approval
  rule before adding a Vercel or container-host token. CI must pass before a
  production dispatch.

For a rollback, redeploy the previous image digest, run the matching migration
rollback only when the migration is backward-compatible, and verify `/health`,
queue lag, and proof verification before reopening traffic.
