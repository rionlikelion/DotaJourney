"""Parse OpenDota match JSON into relational rows."""
import json
from datetime import datetime, timezone
from typing import Any

from backend.opendota import map_lane_role
from backend.parser import player_team, player_won


def _hero_names(heroes: dict[int, str]) -> dict[int, str]:
    return heroes


def parse_opendota_match(
    match: dict,
    account_id: int,
    heroes: dict[int, str],
) -> dict[str, Any]:
    match_id = int(match["match_id"])
    radiant_win = match.get("radiant_win")
    rw = 1 if radiant_win else 0 if radiant_win is not None else None

    my_player = None
    players_rows = []
    upgrades_rows = []
    units_rows = []

    for p in match.get("players") or []:
        slot = int(p.get("player_slot", 0))
        aid = p.get("account_id")
        if aid is not None:
            aid = int(aid)
        is_me = 1 if aid == account_id else 0
        hero_id = p.get("hero_id")
        hero_data = heroes.get(hero_id) if hero_id else None
        hero_name = None
        hero_slug = None
        if hero_data is not None:
            if isinstance(hero_data, dict):
                hero_name = hero_data.get("localized_name")
                hero_slug = hero_data.get("slug")
            else:
                hero_name = hero_data
        lane_role = p.get("lane_role")
        parsed_role = map_lane_role(lane_role, p.get("is_roaming", False))

        row = {
            "match_id": match_id,
            "player_slot": slot,
            "account_id": aid,
            "hero_id": hero_id,
            "hero_name": hero_name,
            "is_me": is_me,
            "team": player_team(slot),
            "lane_role": lane_role,
            "parsed_role": parsed_role,
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
            "item_0": p.get("item_0"),
            "item_1": p.get("item_1"),
            "item_2": p.get("item_2"),
            "item_3": p.get("item_3"),
            "item_4": p.get("item_4"),
            "item_5": p.get("item_5"),
            "item_0_name": None,
            "item_1_name": None,
            "item_2_name": None,
            "item_3_name": None,
            "item_4_name": None,
            "item_5_name": None,
            "won": player_won(slot, radiant_win),
            "hero_slug": hero_slug,
        }
        players_rows.append(row)
        if is_me:
            my_player = row

        for i, ability in enumerate(p.get("ability_upgrades_arr") or []):
            upgrades_rows.append({
                "match_id": match_id,
                "account_id": aid,
                "player_slot": slot,
                "ability": str(ability),
                "upgrade_time": None,
                "hero_level": i + 1,
            })

    pick_bans_rows = []
    for i, pb in enumerate(match.get("picks_bans") or []):
        hid = pb.get("hero_id")
        hero_data = heroes.get(hid) if hid else None
        hero_name = None
        if hero_data is not None:
            hero_name = hero_data["localized_name"] if isinstance(hero_data, dict) else hero_data
        pick_bans_rows.append({
            "match_id": match_id,
            "hero_id": hid,
            "hero_name": hero_name,
            "is_pick": 1 if pb.get("is_pick") else 0,
            "pick_order": pb.get("order", i),
            "team": pb.get("team"),
        })

    now = datetime.now(timezone.utc).isoformat()
    game_mode = match.get("game_mode")
    lobby_type = match.get("lobby_type")

    match_row = {
        "match_id": match_id,
        "match_seq_num": match.get("match_seq_num"),
        "start_time": int(match["start_time"]),
        "duration": match.get("duration"),
        "season": match.get("season"),
        "radiant_win": rw,
        "tower_status_radiant": None,
        "tower_status_dire": None,
        "barracks_status_radiant": None,
        "barracks_status_dire": None,
        "cluster": match.get("cluster"),
        "cluster_name": str(match.get("cluster")) if match.get("cluster") else None,
        "first_blood_time": match.get("first_blood_time"),
        "lobby_type": lobby_type,
        "lobby_name": str(lobby_type) if lobby_type is not None else None,
        "human_players": 10,
        "leagueid": match.get("leagueid"),
        "positive_votes": None,
        "negative_votes": None,
        "game_mode": game_mode,
        "game_mode_name": str(game_mode) if game_mode is not None else None,
        "radiant_captain": None,
        "dire_captain": None,
        "radiant_team_name": None,
        "radiant_team_logo": None,
        "radiant_team_complete": None,
        "dire_team_name": None,
        "dire_team_logo": None,
        "dire_team_complete": None,
        "won": my_player["won"] if my_player else None,
        "my_hero_name": my_player["hero_name"] if my_player else None,
        "my_hero_id": my_player["hero_id"] if my_player else None,
        "my_kills": my_player["kills"] if my_player else None,
        "my_deaths": my_player["deaths"] if my_player else None,
        "my_assists": my_player["assists"] if my_player else None,
        "my_role": my_player["parsed_role"] if my_player else None,
        "details_json": json.dumps(match, default=str),
        "history_json": None,
        "synced_at": now,
    }

    return {
        "match": match_row,
        "players": players_rows,
        "ability_upgrades": upgrades_rows,
        "pick_bans": pick_bans_rows,
        "additional_units": units_rows,
    }
