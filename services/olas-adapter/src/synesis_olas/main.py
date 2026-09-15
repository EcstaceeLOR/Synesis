"""Private HTTP entry point for the keyless Olas integration boundary."""

from fastapi import Depends, FastAPI, Header, Request
from fastapi.responses import JSONResponse

from synesis_olas import __version__
from synesis_olas.config import Settings, settings
from synesis_olas.errors import AdapterError
from synesis_olas.models import (
    AdapterHealth,
    DeliveryRequest,
    DeliveryResponse,
    ErrorResponse,
    QuoteRequest,
    QuoteResponse,
    RequestPlanRequest,
    RequestPlanResponse,
)
from synesis_olas.official import OfficialMechClient
from synesis_olas.service import OlasAdapterService
from synesis_olas.signer import authenticate_internal_token


def create_app(
    *,
    service: OlasAdapterService | None = None,
    runtime_settings: Settings | None = None,
) -> FastAPI:
    """Build the app with injectable boundaries for deterministic tests."""

    config = runtime_settings or settings
    adapter = service or OlasAdapterService(OfficialMechClient(), environment=config.synesis_mode)
    expected_token = config.olas_adapter_internal_token.get_secret_value()

    def require_internal_auth(authorization: str | None = Header(default=None)) -> None:
        supplied = (
            authorization.removeprefix("Bearer ")
            if authorization and authorization.startswith("Bearer ")
            else None
        )
        if not authenticate_internal_token(supplied, expected_token):
            raise AdapterError("UNAUTHORIZED", "Internal service authentication required", 401)

    application = FastAPI(
        title="Synesis Olas Adapter",
        description="Private, keyless boundary for paid Olas Mech procurement.",
        version=__version__,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )

    @application.exception_handler(AdapterError)
    async def adapter_error(_request: Request, exc: AdapterError) -> JSONResponse:
        body = ErrorResponse(code=exc.code, message=exc.message)
        return JSONResponse(status_code=exc.status_code, content=body.model_dump())

    @application.get("/health", response_model=AdapterHealth)
    def liveness() -> AdapterHealth:
        """Infrastructure liveness; contains no credentials or wallet data."""

        return adapter.health()

    @application.get(
        "/internal/v1/health",
        response_model=AdapterHealth,
        dependencies=[Depends(require_internal_auth)],
    )
    def internal_health() -> AdapterHealth:
        return adapter.health()

    @application.post(
        "/internal/v1/quotes",
        response_model=QuoteResponse,
        dependencies=[Depends(require_internal_auth)],
    )
    def quote(body: QuoteRequest) -> QuoteResponse:
        return adapter.quote(body)

    @application.post(
        "/internal/v1/request-plans",
        response_model=RequestPlanResponse,
        dependencies=[Depends(require_internal_auth)],
    )
    def request_plan(body: RequestPlanRequest) -> RequestPlanResponse:
        return adapter.create_request_plan(body)

    @application.post(
        "/internal/v1/deliveries/parse",
        response_model=DeliveryResponse,
        dependencies=[Depends(require_internal_auth)],
    )
    def delivery(body: DeliveryRequest) -> DeliveryResponse:
        return adapter.parse_delivery(body)

    return application


app = create_app()
