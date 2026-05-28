import json
import logging
from datetime import datetime, timezone
from typing import Any

_log = logging.getLogger(__name__)
_logged_unmapped: set[str] = set()

MATCH_TOP_KEYS = {
    "match_id", "match_seq_num", "start_time", "duration", "season",
    "radiant_win", "tower_status_radiant", "tower_status_dire",
    "barracks_status_radiant", "barracks_status_dire", "cluster",
    "cluster_name", "first_blood_time", "lobby_type", "lobby_name",
    "human_players", "leagueid", "positive_votes", "negative_votes",
    "game_mode", "game_mode_name", "radiant_captain", "dire_captain",
    "players", "pick_bans", "radiant_team", "dire_team",
}

PLAYER_KEYS = {
    "account_id", "player_slot", "hero_id", "hero_name",
    "kills", "deaths", "assists", "leaver_status", "gold",
    "last_hits", "denies", "gold_per_min", "xp_per_min", "gold_spent",
    "hero_damage", "tower_damage", "hero_healing", "level",
    "item_0", "item_1", "item_2", "item_3", "item_4", "item_5",
    "item_0_name", "item_1_name", "item_2_name", "item_3_name",
    "item_4_name", "item_5_name", "ability_upgrades", "additional_units",
}


def to_dict(obj: Any) -> dict:
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, "json") and obj.json:
        return json.loads(obj.json)
    return dict(obj)


def player_team(player_slot: int) -> str:
    return "dire" if player_slot >= 128 else "radiant"


def player_won(player_slot: int, radiant_win: bool | int | None) -> int | None:
    if radiant_win is None:
        return None
    rw = bool(radiant_win)
    on_radiant = player_slot < 128
    return 1 if (on_radiant == rw) else 0


def _log_unmapped(prefix: str, keys: set[str]) -> None:
    for k in keys:
        tag = f"{prefix}.{k}"
        if tag not in _logged_unmapped:
            _logged_unmapped.add(tag)
            _log.info("Unmapped API key: %s", tag)


def _team_fields(match: dict, prefix: str) -> dict[str, Any]:
    team = match.get(prefix) or match.get(f"{prefix}_team") or {}
    if isinstance(team, dict):
        return {
            f"{prefix}_team_name": team.get("team_name"),
            f"{prefix}_team_logo": team.get("team_logo"),
            f"{prefix}_team_complete": team.get("team_complete"),
        }
    return {
        f"{prefix}_team_name": None,
        f"{prefix}_team_logo": None,
        f"{prefix}_team_complete": None,
    }


def parse_match_details(
    details: dict,
    account_id: int,
    history_entry: dict | None = None,
) -> dict[str, Any]:
    """Return structured rows for DB insert."""
    match_id = int(details["match_id"])
    radiant_win = details.get("radiant_win")
    if isinstance(radiant_win, str):
        radiant_win = radiant_win.lower() in ("true", "1", "yes")

    extra_keys = set(details.keys()) - MATCH_TOP_KEYS
    _log_unmapped("match", extra_keys)

    radiant = _team_fields(details, "radiant")
    dire = _team_fields(details, "dire")

    my_player = None
    players_rows = []
    upgrades_rows = []
    units_rows = []

    for p in details.get("players") or []:
        if not isinstance(p, dict):
            p = dict(p)
        pk = set(p.keys()) - PLAYER_KEYS
        _log_unmapped("player", pk)

        slot = int(p.get("player_slot", 0))
        aid = p.get("account_id")
        if aid is not None:
            aid = int(aid)
        is_me = 1 if aid == account_id else 0
        row = {
            "match_id": match_id,
            "player_slot": slot,
            "account_id": aid,
            "hero_id": p.get("hero_id"),
            "hero_name": p.get("hero_name"),
            "is_me": is_me,
            "team": player_team(slot),
            "lane_role": p.get("lane_role"),
            "parsed_role": None,
            "kills": p.get("kills"),
            "deaths": p.get("deaths"),
            "assists": p.get("assists"),
            "leaver_status": p.get("leaver_status"),
            "gold": p.get("gold"),
            "last_hits": p.get("last_hits"),
            "denies": p.get("denies"),
            "gold_per_min": p.get("gold_per_min"),
            "xp_per_min": p.get("xp_per_min"),
            "gold_spent": p.get("gold_spent"),
            "hero_damage": p.get("hero_damage"),
            "tower_damage": p.get("tower_damage"),
            "hero_healing": p.get("hero_healing"),
            "level": p.get("level"),
            "item_0": p.get("item_0"), "item_1": p.get("item_1"),
            "item_2": p.get("item_2"), "item_3": p.get("item_3"),
            "item_4": p.get("item_4"), "item_5": p.get("item_5"),
            "item_0_name": p.get("item_0_name"), "item_1_name": p.get("item_1_name"),
            "item_2_name": p.get("item_2_name"), "item_3_name": p.get("item_3_name"),
            "item_4_name": p.get("item_4_name"), "item_5_name": p.get("item_5_name"),
            "won": player_won(slot, radiant_win),
        }
        players_rows.append(row)
        if is_me:
            my_player = row

        for au in p.get("ability_upgrades") or []:
            if not isinstance(au, dict):
                au = dict(au)
            upgrades_rows.append({
                "match_id": match_id,
                "account_id": aid,
                "player_slot": slot,
                "ability": au.get("ability"),
                "upgrade_time": au.get("time"),
                "hero_level": au.get("level"),
            })

        for unit in p.get("additional_units") or []:
            if not isinstance(unit, dict):
                unit = dict(unit)
            units_rows.append({
                "match_id": match_id,
                "account_id": aid,
                "player_slot": slot,
                "unitname": unit.get("unitname"),
                "item_0": unit.get("item_0"), "item_1": unit.get("item_1"),
                "item_2": unit.get("item_2"), "item_3": unit.get("item_3"),
                "item_4": unit.get("item_4"), "item_5": unit.get("item_5"),
            })

    pick_bans_rows = []
    for i, pb in enumerate(details.get("pick_bans") or []):
        if not isinstance(pb, dict):
            pb = dict(pb)
        pick_bans_rows.append({
            "match_id": match_id,
            "hero_id": pb.get("hero_id"),
            "hero_name": pb.get("hero_name"),
            "is_pick": 1 if pb.get("is_pick") else 0,
            "pick_order": pb.get("order", i),
            "team": pb.get("team"),
        })

    won = my_player["won"] if my_player else None
    now = datetime.now(timezone.utc).isoformat()

    match_row = {
        "match_id": match_id,
        "match_seq_num": details.get("match_seq_num"),
        "start_time": int(details["start_time"]),
        "duration": details.get("duration"),
        "season": details.get("season"),
        "radiant_win": 1 if radiant_win else 0 if radiant_win is not None else None,
        "tower_status_radiant": details.get("tower_status_radiant"),
        "tower_status_dire": details.get("tower_status_dire"),
        "barracks_status_radiant": details.get("barracks_status_radiant"),
        "barracks_status_dire": details.get("barracks_status_dire"),
        "cluster": details.get("cluster"),
        "cluster_name": details.get("cluster_name"),
        "first_blood_time": details.get("first_blood_time"),
        "lobby_type": details.get("lobby_type"),
        "lobby_name": details.get("lobby_name"),
        "human_players": details.get("human_players"),
        "leagueid": details.get("leagueid"),
        "positive_votes": details.get("positive_votes"),
        "negative_votes": details.get("negative_votes"),
        "game_mode": details.get("game_mode"),
        "game_mode_name": details.get("game_mode_name"),
        "radiant_captain": details.get("radiant_captain"),
        "dire_captain": details.get("dire_captain"),
        **radiant,
        **dire,
        "won": won,
        "my_hero_name": my_player["hero_name"] if my_player else None,
        "my_hero_id": my_player["hero_id"] if my_player else None,
        "my_kills": my_player["kills"] if my_player else None,
        "my_deaths": my_player["deaths"] if my_player else None,
        "my_assists": my_player["assists"] if my_player else None,
        "my_role": None,
        "details_json": json.dumps(details, default=str),
        "history_json": json.dumps(history_entry, default=str) if history_entry else None,
        "synced_at": now,
    }

    return {
        "match": match_row,
        "players": players_rows,
        "ability_upgrades": upgrades_rows,
        "pick_bans": pick_bans_rows,
        "additional_units": units_rows,
    }


def upsert_parsed_match(conn, parsed: dict, preserve_my_role: bool = True) -> None:
    """Insert or replace match and child rows."""
    m = parsed["match"]
    match_id = m["match_id"]

    if preserve_my_role:
        cur = conn.execute(
            "SELECT my_role, my_hero_id FROM matches WHERE match_id = ?", (match_id,)
        )
        existing = cur.fetchone()
        if existing:
            if existing["my_role"]:
                m["my_role"] = existing["my_role"]
            if existing["my_hero_id"] and not m.get("my_hero_id"):
                m["my_hero_id"] = existing["my_hero_id"]

    cols = list(m.keys())
    placeholders = ", ".join("?" * len(cols))
    col_names = ", ".join(cols)
    updates = ", ".join(f"{c}=excluded.{c}" for c in cols if c != "match_id")

    conn.execute(
        f"""
        INSERT INTO matches ({col_names}) VALUES ({placeholders})
        ON CONFLICT(match_id) DO UPDATE SET {updates}
        """,
        tuple(m[c] for c in cols),
    )

    for table in (
        "match_players",
        "match_ability_upgrades",
        "match_pick_bans",
        "match_additional_units",
    ):
        conn.execute(f"DELETE FROM {table} WHERE match_id = ?", (match_id,))

    if parsed["players"]:
        pc = list(parsed["players"][0].keys())
        conn.executemany(
            f"""
            INSERT INTO match_players ({", ".join(pc)})
            VALUES ({", ".join("?" * len(pc))})
            """,
            [tuple(r[c] for c in pc) for r in parsed["players"]],
        )

    for key, table in [
        ("ability_upgrades", "match_ability_upgrades"),
        ("pick_bans", "match_pick_bans"),
        ("additional_units", "match_additional_units"),
    ]:
        rows = parsed[key]
        if not rows:
            continue
        rc = list(rows[0].keys())
        conn.executemany(
            f"""
            INSERT INTO {table} ({", ".join(rc)})
            VALUES ({", ".join("?" * len(rc))})
            """,
            [tuple(r[c] for c in rc) for r in rows],
        )
