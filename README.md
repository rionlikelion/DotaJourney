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

| Path on Render | Purpose |
|----------------|---------|
| `/var/data/journey.db` | SQLite database (on persistent disk) |
| `/var/data/clips/` | Match highlight videos |

**First-time setup on Render:**

1. Connect the GitHub repo and apply the Blueprint (`render.yaml`).
2. In the Render dashboard, set **secret** env vars:
   - `ACCOUNT_ID` — your 32-bit Dota account ID (required)
   - `OPENDOTA_API_KEY` — optional, for higher sync rate limits
   - `STEAM_API_KEY` — optional, only if `sync_source` is `both`
3. Copy your local `data/journey.db` to Render once (see **Seeding the database** below).

On Render, `scripts/ensure-config.js` writes `config.json` from env vars at startup (no committed secrets). Locally, keep using `config.json` as before.

**Render dashboard settings** (if not using the Blueprint):

| Setting | Value |
|---------|-------|
| Runtime | Node |
| **Root Directory** | *(leave blank — repo root)* |
| Build Command | `node scripts/render-build.js` |
| Start Command | `node scripts/ensure-config.js && npm --workspace server run start` |

> If Root Directory is set to `server/`, Render will fail with `Missing script: "build"`.

**Build / start** (local or via root `package.json` scripts):

```powershell
npm run build    # vite build
npm run start    # ensure config + serve API + frontend/dist
```

### Seeding the database (one-time)

Stop your local app/sync so `data/journey.db` isn't locked, then copy that file to Render's persistent disk at **`/var/data/journey.db`** (disk mount path in the Render dashboard).

**Easiest manual way — Render Shell + a download link:**

1. Upload `data/journey.db` somewhere with a direct download URL (Dropbox, Google Drive direct link, etc.).
2. In the Render dashboard, open your service → **Shell**.
3. Run:
   ```bash
   curl -L -o /var/data/journey.db "PASTE_YOUR_DOWNLOAD_URL"
   rm -f /var/data/journey.db-wal /var/data/journey.db-shm
   ls -lh /var/data/journey.db
   head -c 15 /var/data/journey.db && echo
   ```
   You should see `SQLite format 3`.
4. **Restart** the service (Dashboard → Manual Deploy → Restart).

After that, the DB lives on the persistent disk and survives redeploys.

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
