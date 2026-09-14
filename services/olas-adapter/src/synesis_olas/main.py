"""HTTP entry point for the Olas integration boundary."""

from datetime import UTC, datetime
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel

from synesis_olas import __version__
from synesis_olas.config import settings


class HealthResponse(BaseModel):
    service: str
    status: Literal["ok"]
    environment: Literal["demo", "live"]
    checked_at: str
    version: str


app = FastAPI(
    title="Synesis Olas Adapter",
    description="A narrow, validated boundary for paid Olas Mech procurement.",
    version=__version__,
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Report process health without exposing configuration or secrets."""

    return HealthResponse(
        service="olas-adapter",
        status="ok",
        environment=settings.synesis_mode,
        checked_at=datetime.now(UTC).isoformat(),
        version=__version__,
    )
