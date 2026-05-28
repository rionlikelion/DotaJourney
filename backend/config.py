import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "config.json"
EXAMPLE_PATH = ROOT / "config.example.json"

VALID_ROLES = frozenset(
    {"carry", "mid", "offlane", "soft_support", "hard_support"}
)


@dataclass
class AppConfig:
    steam_api_key: str
    opendota_api_key: str | None
    account_id: int
    cutoff_date: str
    database_path: Path
    clips_directory: Path
    goal_medal: str
    matches_per_request: int
    clip_extensions: tuple[str, ...]
    sync_source: str  # opendota | valve | both

    @property
    def cutoff_timestamp(self) -> int:
        dt = datetime.strptime(self.cutoff_date, "%Y-%m-%d").replace(
            tzinfo=timezone.utc
        )
        return int(dt.timestamp())


def load_config() -> AppConfig:
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(
            f"Missing {CONFIG_PATH}. Copy config.example.json to config.json "
            "and add your Steam API key and Dota account_id."
        )
    with CONFIG_PATH.open(encoding="utf-8") as f:
        raw = json.load(f)

    db_path = ROOT / raw.get("database_path", "data/journey.db")
    clips_path = ROOT / raw.get("clips_directory", "clips")
    account_id = int(raw["account_id"])
    if account_id <= 0 or account_id > 0xFFFFFFFF:
        raise ValueError("account_id must be a positive 32-bit Dota account ID")

    extensions = tuple(
        raw.get("clip_extensions", [".mp4", ".webm", ".mkv"])
    )

    opendota_key = raw.get("opendota_api_key") or None
    if opendota_key == "":
        opendota_key = None

    return AppConfig(
        steam_api_key=raw.get("steam_api_key", ""),
        opendota_api_key=opendota_key,
        account_id=account_id,
        cutoff_date=raw.get("cutoff_date", "2026-05-01"),
        database_path=db_path,
        clips_directory=clips_path,
        goal_medal=raw.get("goal_medal", "Legend"),
        matches_per_request=int(raw.get("matches_per_request", 100)),
        clip_extensions=extensions,
        sync_source=raw.get("sync_source", "opendota"),
    )
