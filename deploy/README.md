# Deployment

Synesis will be deployed as separate web, API, worker, and Olas adapter services,
with managed PostgreSQL and Redis. Container images, Compose orchestration, and
production manifests are tracked by issue #28 so this scaffold does not create a
false deployment path before the service contracts exist.

The workspace can currently run without PostgreSQL or Redis: all service health
checks and quality gates are deterministic and side-effect free.
