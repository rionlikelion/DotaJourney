"""Sync Dota matches into SQLite (OpenDota primary, Valve optional supplement)."""
import logging
import sys
import time

import dota2api
from dota2api.src.exceptions import APIError, APITimeoutError

from backend.config import load_config
from backend.db import get_connection, init_db, set_sync_state
from backend.opendota import OpenDotaClient
from backend.opendota_parser import parse_opendota_match
from backend.parser import parse_match_details, to_dict, upsert_parsed_match

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
_log = logging.getLogger(__name__)

VALVE_DETAIL_DELAY = 1.0
RECENT_MATCH_RECONCILE_COUNT = 25


def match_exists(conn, match_id: int) -> bool:
    cur = conn.execute(
        "SELECT 1 FROM matches WHERE match_id = ?", (match_id,)
    )
    return cur.fetchone() is not None


def _load_hero_map(client: OpenDotaClient) -> dict[int, dict[str, str]]:
    heroes = {}
    for h in client.get_heroes():
        hero_id = int(h["id"])
        hero_name = h.get("localized_name") or h.get("name", "")
        name = h.get("name") or ""
        slug = name.replace("npc_dota_hero_", "")
        heroes[hero_id] = {
            "localized_name": hero_name,
            "slug": slug,
        }
    return heroes


def _try_valve_supplement(conn, config, match_id: int, account_id: int) -> None:
    if not config.steam_api_key:
        return
    try:
        api = dota2api.Initialise(config.steam_api_key)
        time.sleep(VALVE_DETAIL_DELAY)
        details = to_dict(api.get_match_details(match_id=match_id))
        if not details.get("match_id"):
            return
        parsed = parse_match_details(details, account_id)
        upsert_parsed_match(conn, parsed, preserve_my_role=True)
    except (APIError, APITimeoutError, KeyError) as e:
        _log.debug("Valve supplement skipped for %s: %s", match_id, e)


def _seed_annotation_role(conn, match_id: int, role: str | None) -> None:
    if not role:
        return
    cur = conn.execute(
        "SELECT role_played FROM match_annotations WHERE match_id = ?",
        (match_id,),
    )
    row = cur.fetchone()
    if row and row["role_played"]:
        return
    if row:
        conn.execute(
            "UPDATE match_annotations SET role_played = ? WHERE match_id = ?",
            (role, match_id),
        )
    else:
        conn.execute(
            """
            INSERT INTO match_annotations (match_id, role_played, is_calibration,
                is_milestone, updated_at)
            VALUES (?, ?, 0, 0, datetime('now'))
            """,
            (match_id, role),
        )


def _sync_match_from_summary(
    conn,
    config,
    client: OpenDotaClient,
    heroes: dict[int, dict[str, str]],
    summary: dict,
    stats: dict,
    force_refresh: bool,
) -> None:
    match_id = int(summary["match_id"])
    exists = match_exists(conn, match_id)

    if exists and not force_refresh:
        stats["skipped"] += 1
        return

    try:
        full = client.get_match(match_id)
        parsed = parse_opendota_match(full, config.account_id, heroes)
        upsert_parsed_match(conn, parsed, preserve_my_role=True)

        my_role = parsed["match"].get("my_role")
        if my_role and not exists:
            _seed_annotation_role(conn, match_id, my_role)

        if config.sync_source == "both":
            _try_valve_supplement(conn, config, match_id, config.account_id)

        conn.commit()

        if exists:
            stats["updated"] += 1
        else:
            stats["inserted"] += 1

    except Exception as e:
        _log.error("Failed match %s: %s", match_id, e)
        stats["errors"] += 1


def sync_opendota(
    conn,
    config,
    force_refresh: bool = False,
    max_matches: int | None = None,
) -> dict:
    client = OpenDotaClient(config.opendota_api_key)
    heroes = _load_hero_map(client)
    cutoff = config.cutoff_timestamp
    stats = {
        "source": "opendota",
        "list_fetched": 0,
        "candidates": 0,
        "recent_reconcile_count": RECENT_MATCH_RECONCILE_COUNT,
        "inserted": 0,
        "updated": 0,
        "skipped": 0,
        "errors": 0,
    }

    offset = RECENT_MATCH_RECONCILE_COUNT
    page_size = min(config.matches_per_request, 100)
    stop = False
    processed_match_ids: set[int] = set()

    # Always reconcile the most recent matches so delayed OpenDota availability
    # cannot cause permanent gaps in the local SQLite store.
    try:
        recent_batch = client.get_player_matches(
            config.account_id,
            limit=RECENT_MATCH_RECONCILE_COUNT,
            offset=0,
        )
    except Exception as e:
        _log.error("OpenDota recent match reconciliation failed: %s", e)
        raise

    stats["list_fetched"] += len(recent_batch)
    for summary in recent_batch:
        match_id = int(summary["match_id"])
        processed_match_ids.add(match_id)
        stats["candidates"] += 1
        _sync_match_from_summary(
            conn,
            config,
            client,
            heroes,
            summary,
            stats,
            force_refresh,
        )
        if max_matches and stats["inserted"] + stats["updated"] >= max_matches:
            stop = True
            break

    while not stop:
        try:
            batch = client.get_player_matches(
                config.account_id, limit=page_size, offset=offset
            )
        except Exception as e:
            _log.error("OpenDota match list failed: %s", e)
            raise

        if not batch:
            break

        stats["list_fetched"] += len(batch)
        in_range = [
            s for s in batch if int(s.get("start_time", 0)) >= cutoff
        ]
        if not in_range:
            break

        for summary in in_range:
            match_id = int(summary["match_id"])
            if match_id in processed_match_ids:
                continue
            processed_match_ids.add(match_id)
            stats["candidates"] += 1
            if match_exists(conn, match_id) and not force_refresh:
                stats["skipped"] += 1
                stop = True
                break

            _sync_match_from_summary(
                conn,
                config,
                client,
                heroes,
                summary,
                stats,
                force_refresh,
            )

            if max_matches and stats["inserted"] + stats["updated"] >= max_matches:
                stop = True
                break

        if stop:
            break
        if len(batch) < page_size:
            break
        offset += page_size

    return stats


def sync_matches(
    force_refresh: bool = False,
    max_new_details: int | None = None,
) -> dict:
    config = load_config()
    init_db(config.database_path)

    with get_connection(config.database_path) as conn:
        if config.sync_source in ("opendota", "both"):
            stats = sync_opendota(
                conn, config, force_refresh, max_new_details
            )
        else:
            stats = {"source": "valve", "errors": 1, "message": "Valve-only not implemented; use opendota"}

        set_sync_state(conn, "last_sync_at", str(int(time.time())))
        set_sync_state(conn, "last_sync_source", stats.get("source", "opendota"))
        conn.commit()

    _log.info("Sync complete: %s", stats)
    return stats


def main() -> None:
    force = "--force" in sys.argv
    sync_matches(force_refresh=force)


if __name__ == "__main__":
    main()
