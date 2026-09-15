"""Typed failures at the Olas adapter trust boundary."""


class AdapterError(Exception):
    """A safe, machine-readable adapter failure."""

    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class DisabledCapabilityError(AdapterError):
    """A signing or execution mode that v1 intentionally cannot use."""

    def __init__(self, capability: str) -> None:
        super().__init__(
            "CAPABILITY_DISABLED",
            f"{capability} is disabled in Synesis v1",
            422,
        )
