import fs from 'fs'
import path from 'path'
import { loadConfig } from './config.js'

let clipCountCache = null
let clipCountCacheKey = null

function clipDirectoryKey(cfg) {
  const dir = cfg.clipsDirectory
  if (!fs.existsSync(dir)) return `${dir}:missing`
  return `${dir}:${fs.statSync(dir).mtimeMs}`
}

function countClipsInDir(dir, extensions) {
  if (!fs.existsSync(dir)) return 0

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .filter((e) => extensions.includes(path.extname(e.name).toLowerCase()))
    .length
}

export function getClipCountsByMatchId() {
  const cfg = loadConfig()
  try {
    const key = clipDirectoryKey(cfg)
    if (clipCountCache && clipCountCacheKey === key) return clipCountCache

    const counts = new Map()
    if (fs.existsSync(cfg.clipsDirectory)) {
      for (const entry of fs.readdirSync(cfg.clipsDirectory, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const matchId = Number(entry.name)
        if (!Number.isFinite(matchId)) continue
        const count = countClipsInDir(
          path.join(cfg.clipsDirectory, entry.name),
          cfg.clipExtensions
        )
        if (count > 0) counts.set(matchId, count)
      }
    }

    clipCountCache = counts
    clipCountCacheKey = key
    return counts
  } catch (err) {
    console.warn('[clips] failed to scan clip directory:', err.message)
    return clipCountCache || new Map()
  }
}

export function clipSummaryForMatch(matchId, clipCounts = getClipCountsByMatchId()) {
  const clipCount = clipCounts.get(Number(matchId)) || 0
  return {
    has_clips: clipCount > 0,
    clip_count: clipCount,
  }
}

export function listClips(matchId) {
  const cfg = loadConfig()
  try {
    const dir = path.join(cfg.clipsDirectory, String(matchId))
    if (!fs.existsSync(dir)) return []

    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile())
      .filter((e) =>
        cfg.clipExtensions.includes(path.extname(e.name).toLowerCase())
      )
      .map((e) => {
        const full = path.join(dir, e.name)
        return {
          filename: e.name,
          url: `/api/clips/${matchId}/${encodeURIComponent(e.name)}`,
          size_bytes: fs.statSync(full).size,
        }
      })
  } catch (err) {
    console.warn(`[clips] failed to list clips for match ${matchId}:`, err.message)
    return []
  }
}

export function resolveClipPath(matchId, filename) {
  const cfg = loadConfig()
  const dir = path.resolve(cfg.clipsDirectory, String(matchId))
  const file = path.resolve(dir, path.basename(filename))
  if (!file.startsWith(dir + path.sep) && file !== dir) return null
  if (!fs.existsSync(file)) return null
  const ext = path.extname(file).toLowerCase()
  if (!cfg.clipExtensions.includes(ext)) return null
  return file
}
