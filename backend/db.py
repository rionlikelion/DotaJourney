import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS matches (
    match_id INTEGER PRIMARY KEY,
    match_seq_num INTEGER,
    start_time INTEGER NOT NULL,
    duration INTEGER,
    season INTEGER,
    radiant_win INTEGER,
    tower_status_radiant INTEGER,
    tower_status_dire INTEGER,
    barracks_status_radiant INTEGER,
    barracks_status_dire INTEGER,
    cluster INTEGER,
    cluster_name TEXT,
    first_blood_time INTEGER,
    lobby_type INTEGER,
    lobby_name TEXT,
    human_players INTEGER,
    leagueid INTEGER,
    positive_votes INTEGER,
    negative_votes INTEGER,
    game_mode INTEGER,
    game_mode_name TEXT,
    radiant_captain INTEGER,
    dire_captain INTEGER,
    radiant_team_name TEXT,
    radiant_team_logo INTEGER,
    radiant_team_complete INTEGER,
    dire_team_name TEXT,
    dire_team_logo INTEGER,
    dire_team_complete INTEGER,
    won INTEGER,
    my_hero_name TEXT,
    my_kills INTEGER,
    my_deaths INTEGER,
    my_assists INTEGER,
    my_role TEXT,
    details_json TEXT,
    history_json TEXT,
    synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS match_players (
    match_id INTEGER NOT NULL,
    player_slot INTEGER NOT NULL,
    account_id INTEGER,
    hero_id INTEGER,
    hero_name TEXT,
    hero_slug TEXT,
    is_me INTEGER NOT NULL DEFAULT 0,
    team TEXT,
    lane_role INTEGER,
    parsed_role TEXT,
    kills INTEGER,
    deaths INTEGER,
    assists INTEGER,
    leaver_status INTEGER,
    gold INTEGER,
    last_hits INTEGER,
    denies INTEGER,
    gold_per_min INTEGER,
    xp_per_min INTEGER,
    gold_spent INTEGER,
    hero_damage INTEGER,
    tower_damage INTEGER,
    hero_healing INTEGER,
    level INTEGER,
    item_0 INTEGER, item_1 INTEGER, item_2 INTEGER,
    item_3 INTEGER, item_4 INTEGER, item_5 INTEGER,
    item_0_name TEXT, item_1_name TEXT, item_2_name TEXT,
    item_3_name TEXT, item_4_name TEXT, item_5_name TEXT,
    won INTEGER,
    PRIMARY KEY (match_id, player_slot),
    FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS match_ability_upgrades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL,
    account_id INTEGER,
    player_slot INTEGER,
    ability TEXT,
    upgrade_time INTEGER,
    hero_level INTEGER,
    FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS match_pick_bans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL,
    hero_id INTEGER,
    hero_name TEXT,
    is_pick INTEGER,
    pick_order INTEGER,
    team INTEGER,
    FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS match_additional_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL,
    account_id INTEGER,
    player_slot INTEGER,
    unitname TEXT,
    item_0 INTEGER, item_1 INTEGER, item_2 INTEGER,
    item_3 INTEGER, item_4 INTEGER, item_5 INTEGER,
    FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS match_annotations (
    match_id INTEGER PRIMARY KEY,
    diary_entry TEXT,
    mmr_before INTEGER,
    mmr_after INTEGER,
    mmr_delta INTEGER,
    medal_before TEXT,
    medal_after TEXT,
    is_calibration INTEGER NOT NULL DEFAULT 0,
    role_played TEXT CHECK (
        role_played IS NULL OR role_played IN (
            'carry', 'mid', 'offlane', 'soft_support', 'hard_support'
        )
    ),
    is_milestone INTEGER NOT NULL DEFAULT 0,
    tags TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matches_start_time ON matches(start_time);
CREATE INDEX IF NOT EXISTS idx_matches_won ON matches(won);
CREATE INDEX IF NOT EXISTS idx_match_players_hero ON match_players(hero_name);
CREATE INDEX IF NOT EXISTS idx_match_players_is_me ON match_players(is_me);
CREATE INDEX IF NOT EXISTS idx_annotations_role ON match_annotations(role_played);
"""


MIGRATIONS = [
    "ALTER TABLE match_players ADD COLUMN lane_role INTEGER",
    "ALTER TABLE match_players ADD COLUMN parsed_role TEXT",
    "ALTER TABLE match_players ADD COLUMN hero_slug TEXT",
    "ALTER TABLE matches ADD COLUMN my_hero_id INTEGER",
]


def init_db(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with get_connection(db_path) as conn:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA busy_timeout = 30000")
        conn.executescript(SCHEMA_SQL)
        for sql in MIGRATIONS:
            try:
                conn.execute(sql)
            except sqlite3.OperationalError:
                pass
        conn.commit()


@contextmanager
def get_connection(db_path: Path) -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(db_path, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    try:
        yield conn
    finally:
        conn.close()


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


def get_sync_state(conn: sqlite3.Connection, key: str) -> str | None:
    cur = conn.execute("SELECT value FROM sync_state WHERE key = ?", (key,))
    row = cur.fetchone()
    return row["value"] if row else None


def set_sync_state(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        """
        INSERT INTO sync_state (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (key, value),
    )
