import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CONFIG_PATH = path.join(ROOT, 'config.json')
const EXAMPLE_PATH = path.join(ROOT, 'config.example.json')

function env(name, fallback = '') {
  const value = process.env[name]
  return value === undefined || value === '' ? fallback : value
}

function resolveDataPath(relativeOrAbsolute, defaultRelative) {
  const raw = relativeOrAbsolute || defaultRelative
  return path.isAbsolute(raw) ? raw : path.join(ROOT, raw)
}

function buildFromEnv() {
  const onRender = process.env.RENDER === 'true'
  const accountId = env('ACCOUNT_ID')
  if (!accountId) {
    throw new Error(
      'Missing ACCOUNT_ID. Set it in the Render dashboard or create config.json locally.'
    )
  }

  return {
    steam_api_key: env('STEAM_API_KEY'),
    opendota_api_key: env('OPENDOTA_API_KEY') || null,
    account_id: Number(accountId),
    cutoff_date: env('CUTOFF_DATE', '2026-05-01'),
    database_path: env(
      'DATABASE_PATH',
      onRender ? '/var/data/journey.db' : 'data/journey.db'
    ),
    clips_directory: env(
      'CLIPS_DIRECTORY',
      onRender ? '/var/data/clips' : 'data/clips'
    ),
    goal_medal: env('GOAL_MEDAL', 'Legend'),
    matches_per_request: Number(env('MATCHES_PER_REQUEST', '100')),
    sync_source: env('SYNC_SOURCE', 'opendota'),
    clip_extensions: ['.mp4', '.webm', '.mkv'],
  }
}

function ensureDataDirs(config) {
  const dbPath = resolveDataPath(config.database_path, 'data/journey.db')
  const clipsPath = resolveDataPath(config.clips_directory, 'clips')
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  fs.mkdirSync(clipsPath, { recursive: true })
}

// On Render, always rebuild config from env vars (don't keep a stale config.json).
if (process.env.RENDER === 'true' || process.env.ACCOUNT_ID) {
  const config = buildFromEnv()
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`)
  ensureDataDirs(config)
  console.log('[config] wrote config.json from environment variables')
  console.log(`[config] database_path=${config.database_path}`)
  process.exit(0)
}

if (fs.existsSync(CONFIG_PATH)) {
  const existing = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  ensureDataDirs(existing)
  console.log('[config] using existing config.json')
  process.exit(0)
}

if (fs.existsSync(EXAMPLE_PATH)) {
  throw new Error(
    'Missing config.json. Copy config.example.json locally, or set ACCOUNT_ID on Render.'
  )
}

throw new Error('Missing config.json and config.example.json.')
