"""Linux deployment smoke test for the exact official dependency."""

import sys

import pytest

from synesis_olas.official import PINNED_MECH_CLIENT_VERSION, installed_mech_client_version


@pytest.mark.skipif(
    sys.platform == "win32",
    reason="safe-pysha3 publishes Linux wheels; Synesis deploys this service on Linux",
)
def test_official_mech_client_public_api_imports() -> None:
    import mech_client

    assert installed_mech_client_version() == PINNED_MECH_CLIENT_VERSION
    assert mech_client.__version__ == PINNED_MECH_CLIENT_VERSION
    assert mech_client.MarketplaceService is not None
    assert mech_client.Signer is not None
