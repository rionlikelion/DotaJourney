import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, '..')
const CONFIG_PATH = path.join(ROOT, 'config.json')

export const VALID_ROLES = new Set([
  'carry',
  'mid',
  'offlane',
  'soft_support',
  'hard_support',
])

let cached = null

export function loadConfig() {
  if (cached) return cached
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      'Missing config.json. Copy config.example.json and fill in your keys.'
    )
  }
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  const cutoffDate = raw.cutoff_date || '2026-05-01'
  const cutoffTs = Math.floor(
    new Date(`${cutoffDate}T00:00:00Z`).getTime() / 1000
  )

  cached = {
    steamApiKey: raw.steam_api_key || '',
    opendotaApiKey: raw.opendota_api_key || null,
    accountId: Number(raw.account_id),
    cutoffDate,
    cutoffTimestamp: cutoffTs,
    databasePath: path.join(ROOT, raw.database_path || 'data/journey.db'),
    clipsDirectory: path.join(ROOT, raw.clips_directory || 'clips'),
    goalMedal: raw.goal_medal || 'Legend',
    matchesPerRequest: Number(raw.matches_per_request || 100),
    syncSource: raw.sync_source || 'opendota',
    clipExtensions: raw.clip_extensions || ['.mp4', '.webm', '.mkv'],
  }
  return cached
}

export function roleLabel(value) {
  const labels = {
    carry: 'Carry',
    mid: 'Mid',
    offlane: 'Offlane',
    soft_support: 'Soft Support',
    hard_support: 'Hard Support',
  }
  return labels[value] || value || '—'
}
