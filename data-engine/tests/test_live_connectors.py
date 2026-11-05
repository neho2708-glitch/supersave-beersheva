"""Live tests against the real sources. Run with SUPERSAVE_LIVE=1, or `npm run verify:connectors`.

A network failure is reported as such (UNAVAILABLE), not as a pass. Sources may block
addresses outside Israel, so CI records these results without failing on network errors.
"""
import os

import pytest

from supersave_engine.connectors.portals import ALL_CONNECTORS
from supersave_engine.verify import check_connector

live = pytest.mark.skipif(not os.environ.get("SUPERSAVE_LIVE"), reason="set SUPERSAVE_LIVE=1 to hit real sources")


@live
@pytest.mark.parametrize("connector", ALL_CONNECTORS, ids=lambda c: c.slug)
def test_connector_proves_real_data(connector):
    result = check_connector(connector())
    assert result["status"] in ("VERIFIED", "STALE"), result
    assert result["beerShevaBranches"]
    assert result["itemsParsed"] >= 100
    assert result["validPrices"] > 0
    assert float(result["sample"]["price"]) > 0
    assert result["sample"]["name"]
