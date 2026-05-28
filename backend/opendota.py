"""OpenDota API client — https://docs.opendota.com/"""
import logging
import time
from typing import Any

import requests

_log = logging.getLogger(__name__)
BASE_URL = "https://api.opendota.com/api"
REQUEST_DELAY = 0.34  # ~3 req/s without premium; be polite

LANE_ROLE_TO_POSITION = {
    0: None,
    1: "carry",
    2: "mid",
    3: "offlane",
    4: "offlane",
    5: "hard_support",
}


def map_lane_role(lane_role: int | None, is_roaming: bool = False) -> str | None:
    if is_roaming:
        return "hard_support"
    if lane_role is None:
        return None
    return LANE_ROLE_TO_POSITION.get(int(lane_role))


class OpenDotaClient:
    def __init__(self, api_key: str | None = None):
        self.session = requests.Session()
        if api_key:
            self.session.headers["Authorization"] = f"Bearer {api_key}"

    def _get(self, path: str, params: dict | None = None) -> Any:
        time.sleep(REQUEST_DELAY)
        url = f"{BASE_URL}{path}"
        resp = self.session.get(url, params=params, timeout=60)
        resp.raise_for_status()
        return resp.json()

    def get_player_matches(
        self, account_id: int, limit: int = 100, offset: int = 0
    ) -> list[dict]:
        return self._get(
            f"/players/{account_id}/matches",
            {"limit": limit, "offset": offset},
        )

    def get_match(self, match_id: int) -> dict:
        return self._get(f"/matches/{match_id}")

    def get_heroes(self) -> list[dict]:
        return self._get("/heroes")
