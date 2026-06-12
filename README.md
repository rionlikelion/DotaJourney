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

### 3. Node workspace

```powershell
npm run bootstrap
```

This installs dependencies from the root workspace so `server/` and `frontend/` are managed together.

### 4. One-command start

```powershell
.\start.ps1
```

Stops old servers on 8000/5173, starts **Node API** + **Vite** immediately, and runs `python run_sync.py` in the background. Sync logs are written to `logs/sync.stdout.log` and `logs/sync.stderr.log`.

Open http://localhost:5173

### Manual start

```powershell
python run_sync.py
npm run dev:server
npm run dev:frontend
```

The API and frontend are both managed through the root workspace. Use `npm run sync` for Python-only sync runs.

### Deploy as a Node site

```powershell
npm run build:frontend
npm run start:server
```

Serves API and the built Vue app from `frontend/dist` on port 8000.

### Deploy to Render

This repo includes a `render.yaml` Blueprint (same pattern as [riongardner.com](https://github.com/riongardner/riongardner.com)): a single web service with a **persistent disk** mounted at `data/`.

| Path | Purpose |
|------|---------|
| `data/journey.db` | SQLite database (survives redeploys) |
| `data/clips/` | Match highlight videos (on Render; local dev uses `clips/` at repo root) |

**First-time setup on Render:**

1. Connect the GitHub repo and apply the Blueprint (`render.yaml`).
2. In the Render dashboard, set **secret** env vars:
   - `ACCOUNT_ID` — your 32-bit Dota account ID (required)
   - `OPENDOTA_API_KEY` — optional, for higher sync rate limits
   - `STEAM_API_KEY` — optional, only if `sync_source` is `both`
3. Seed the database — either:
   - Run `python run_sync.py` locally, then upload `data/journey.db` to the Render disk (via shell or one-time copy), or
   - Install Python on the instance and call `POST /api/sync` after deploy.

On Render, `scripts/ensure-config.js` writes `config.json` from env vars at startup (no committed secrets). Locally, keep using `config.json` as before.

**Build / start** (also what Render runs):

```powershell
npm run build    # install + vite build
npm run start    # ensure config + serve API + frontend/dist
```

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
