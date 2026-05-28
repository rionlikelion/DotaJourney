# Rion Dota Journey

A local diary and analytics tool for your Dota 2 climb to **Legend**.

- **Python** — match sync only ([dota2api](https://github.com/joshuaduffy/dota2api) + [OpenDota API](https://docs.opendota.com/))
- **Node (Express)** — REST API you can deploy as a normal Node site
- **Vue 3** — local UI

## Setup

### 1. Config

```powershell
copy config.example.json config.json
```

Edit `config.json`:

| Field | Purpose |
|-------|---------|
| `opendota_api_key` | Optional. From [OpenDota API keys](https://docs.opendota.com/) — higher rate limits |
| `steam_api_key` | Optional. Only used if `sync_source` is `both` (Valve supplement) |
| `account_id` | Your **32-bit Dota account ID** (same ID OpenDota uses) |
| `cutoff_date` | Only sync matches on/after this date (default `2026-05-01`) |
| `sync_source` | `opendota` (recommended), `both`, or `valve` |

### 2. Python (sync only)

```powershell
python -m pip install --user -r requirements.txt
```

> The Python backend is only used for match sync. It does not host the frontend or the REST API.

### 3. Node (API)

```powershell
cd server
npm install
```

### 4. Frontend

```powershell
cd frontend
npm install
```

### 5. One-command start

```powershell
.\start.ps1
```

Stops old servers on 8000/5173, runs `python run_sync.py`, then starts **Node API** + **Vite**.

Open http://localhost:5173

### Manual start

```powershell
python run_sync.py
cd server
npm run dev
```

```powershell
cd frontend
npm run dev
```

### Deploy as a Node site

```powershell
cd frontend && npm run build
cd ../server && npm start
```

Serves API and the built Vue app from `frontend/dist` on port 8000.

## Why OpenDota?

Valve `get_match_details` often returns empty payloads for recent matches. **OpenDota** provides full parsed matches and **`lane_role`** per player (mapped to carry / mid / offlane / support). Roles are auto-filled on sync; you can override them in the diary form.

## Clips

```
clips/
  8824577844/
    highlight.mp4
```

## Project layout

- `backend/` — Python sync + SQLite writers
- `server/` — Node Express API
- `frontend/` — Vue 3 app
- `data/journey.db` — SQLite (gitignored)
