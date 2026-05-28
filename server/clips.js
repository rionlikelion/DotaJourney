import fs from 'fs'
import path from 'path'
import { loadConfig } from './config.js'

export function listClips(matchId) {
  const cfg = loadConfig()
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
