# Olas adapter

This Python 3.11 service owns the future `mech-client` integration while keeping
Python and blockchain-specific dependencies outside the TypeScript runtime.

```powershell
uv sync --locked --all-extras --dev
uv run uvicorn synesis_olas.main:app --reload --port 8100
```

The health endpoint is available at `GET /health`. Paid Mech submission and
delivery retrieval are intentionally delivered by the dedicated integration issues.
