import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import { loadConfig, VALID_ROLES, roleLabel, ROOT } from './config.js'
import { getDb, rowToObject } from './db.js'
import { listClips, resolveClipPath } from './clips.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function medalRankUp(before, after) {
  if (!before || !after) return false
  return after.trim().toLowerCase() !== before.trim().toLowerCase()
}

function enrichAnnotation(row) {
  if (!row) return null
  const d = { ...row }
  if (d.mmr_before != null && d.mmr_after != null && d.mmr_delta == null) {
    d.mmr_delta = d.mmr_after - d.mmr_before
  }
  d.rank_up = medalRankUp(d.medal_before, d.medal_after)
  return d
}

function getPreviousCompletedAnnotation(db, matchId) {
  return rowToObject(
    db
      .prepare(
        `SELECT match_id, mmr_after, medal_after
         FROM match_annotations
         WHERE match_id < ?
           AND mmr_after IS NOT NULL
           AND medal_after IS NOT NULL
         ORDER BY match_id DESC
         LIMIT 1`
      )
      .get(matchId)
  )
}

function prepopulateMatchBeforeValues(annotation, db, matchId) {
  const existing = annotation ? { ...annotation } : {}
  const needsMmrBefore = existing.mmr_before == null
  const needsMedalBefore = !existing.medal_before
  if (!needsMmrBefore && !needsMedalBefore) return existing

  const prev = getPreviousCompletedAnnotation(db, matchId)
  if (!prev) return existing

  if (needsMmrBefore) existing.mmr_before = prev.mmr_after
  if (needsMedalBefore) existing.medal_before = prev.medal_after
  return existing
}

export function createRouter() {
  const router = express.Router()

  router.get('/health', (_req, res) => res.json({ status: 'ok' }))

  router.get('/config/public', (_req, res) => {
    const c = loadConfig()
    res.json({
      goal_medal: c.goalMedal,
      cutoff_date: c.cutoffDate,
      account_id: c.accountId,
      sync_source: c.syncSource,
    })
  })

  router.get('/hero-metadata', async (_req, res) => {
    try {
      const c = loadConfig()
      const response = await fetch('https://api.opendota.com/api/heroes')
      const heroes = await response.json()
      res.json({
        heroes: (heroes || []).map((h) => ({
          id: h.id,
          name: h.name,
          localized_name: h.localized_name,
        })),
      })
    } catch (err) {
      res.status(500).json({ ok: false, detail: String(err) })
    }
  })

  router.post('/sync', (req, res) => {
    const force = req.query.force === 'true'
    const py = spawn('python', ['run_sync.py', ...(force ? ['--force'] : [])], {
      cwd: ROOT,
      shell: true,
    })
    let out = ''
    let err = ''
    py.stdout.on('data', (d) => { out += d })
    py.stderr.on('data', (d) => { err += d })
    py.on('close', (code) => {
      if (code !== 0) {
        return res.status(500).json({ ok: false, detail: err || out || `exit ${code}` })
      }
      res.json({ ok: true, message: out.trim() || 'Sync complete' })
    })
  })

  router.post('/reset', (req, res) => {
    const db = getDb()
    db.prepare('DELETE FROM match_annotations').run()
    db.prepare('DELETE FROM match_players').run()
    db.prepare('DELETE FROM match_pick_bans').run()
    db.prepare('DELETE FROM match_ability_upgrades').run()
    db.prepare('DELETE FROM match_additional_units').run()
    db.prepare('DELETE FROM matches').run()
    db.prepare('DELETE FROM sync_state').run()
    db.prepare('VACUUM').run()

    const py = spawn('python', ['run_sync.py', '--force'], {
      cwd: ROOT,
      shell: true,
    })
    let out = ''
    let err = ''
    py.stdout.on('data', (d) => { out += d })
    py.stderr.on('data', (d) => { err += d })
    py.on('close', (code) => {
      if (code !== 0) {
        return res.status(500).json({ ok: false, detail: err || out || `exit ${code}` })
      }
      res.json({ ok: true, message: out.trim() || 'Reset + resync complete' })
    })
  })

  router.get('/matches', (req, res) => {
    const db = getDb()
    const clauses = ['1=1']
    const params = []

    if (req.query.hero) {
      clauses.push('m.my_hero_name = ?')
      params.push(req.query.hero)
    }
    if (req.query.won != null) {
      clauses.push('m.won = ?')
      params.push(Number(req.query.won))
    }
    if (req.query.role) {
      clauses.push('(m.my_role = ? OR a.role_played = ?)')
      params.push(req.query.role, req.query.role)
    }
    if (req.query.from) {
      clauses.push('m.start_time >= ?')
      params.push(Number(req.query.from))
    }
    if (req.query.to) {
      clauses.push('m.start_time <= ?')
      params.push(Number(req.query.to))
    }
    if (req.query.has_diary === 'true') {
      clauses.push(
        "a.diary_entry IS NOT NULL AND trim(a.diary_entry) != ''"
      )
    }

    const sortCol = req.query.sort === 'match_id' ? 'm.match_id' : 'm.start_time'
    const ord = req.query.order === 'asc' ? 'ASC' : 'DESC'
    const limit = Math.min(Number(req.query.limit || 50), 200)
    const offset = Number(req.query.offset || 0)

    const rows = db
      .prepare(
        `
        SELECT m.*, a.diary_entry, a.mmr_delta, a.medal_before, a.medal_after,
               a.is_calibration, a.is_milestone, a.role_played,
               COALESCE(a.role_played, m.my_role) AS effective_role
        FROM matches m
        LEFT JOIN match_annotations a ON a.match_id = m.match_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY ${sortCol} ${ord}
        LIMIT ? OFFSET ?
      `
      )
      .all(...params, limit, offset)

    let matches = rows.map((m) => ({
      ...m,
      has_clips: listClips(m.match_id).length > 0,
      clip_count: listClips(m.match_id).length,
    }))

    if (req.query.has_clips === 'true') {
      matches = matches.filter((m) => m.has_clips)
    } else if (req.query.has_clips === 'false') {
      matches = matches.filter((m) => !m.has_clips)
    }

    res.json({ matches, count: matches.length })
  })

  router.get('/matches/:matchId', (req, res) => {
    const db = getDb()
    const matchId = Number(req.params.matchId)
    const match = rowToObject(
      db.prepare('SELECT * FROM matches WHERE match_id = ?').get(matchId)
    )
    if (!match) return res.status(404).json({ detail: 'Match not found' })

    if (req.query.include_raw !== '1') {
      delete match.details_json
      delete match.history_json
    }

    const players = db
      .prepare(
        'SELECT * FROM match_players WHERE match_id = ? ORDER BY player_slot'
      )
      .all(matchId)
    const pick_bans = db
      .prepare(
        'SELECT * FROM match_pick_bans WHERE match_id = ? ORDER BY pick_order'
      )
      .all(matchId)
    const ability_upgrades = db
      .prepare(
        'SELECT * FROM match_ability_upgrades WHERE match_id = ? ORDER BY upgrade_time'
      )
      .all(matchId)
    const annotation = prepopulateMatchBeforeValues(
      enrichAnnotation(
        rowToObject(
          db
            .prepare('SELECT * FROM match_annotations WHERE match_id = ?')
            .get(matchId)
        )
      ),
      db,
      matchId
    )

    res.json({
      match,
      players,
      pick_bans,
      ability_upgrades,
      annotation,
      clips: listClips(matchId),
    })
  })

  router.put('/matches/:matchId/annotation', express.json(), (req, res) => {
    const db = getDb()
    const matchId = Number(req.params.matchId)
    const body = req.body || {}

    if (body.role_played && !VALID_ROLES.has(body.role_played)) {
      return res.status(400).json({
        detail: `Invalid role. Use: ${[...VALID_ROLES].join(', ')}`,
      })
    }

    const exists = db
      .prepare('SELECT match_id FROM matches WHERE match_id = ?')
      .get(matchId)
    if (!exists) return res.status(404).json({ detail: 'Match not found' })

    const prev = rowToObject(
      db
        .prepare('SELECT * FROM match_annotations WHERE match_id = ?')
        .get(matchId)
    )

    const hasField = (field) =>
      Object.prototype.hasOwnProperty.call(body, field)

    const pick = (field, val, def = null) =>
      hasField(field) ? val : prev?.[field] ?? def

    const mb = pick('mmr_before', body.mmr_before)
    const ma = pick('mmr_after', body.mmr_after)
    let delta
    if (mb != null && ma != null) {
      delta = ma - mb
    } else if (hasField('mmr_before') || hasField('mmr_after')) {
      delta = null
    } else {
      delta = pick('mmr_delta', body.mmr_delta)
    }

    let isCal =
      body.is_calibration != null
        ? body.is_calibration
          ? 1
          : 0
        : pick('is_calibration', null, delta === 0 && mb != null ? 1 : 0)

    const merged = {
      diary_entry: pick('diary_entry', body.diary_entry),
      mmr_before: mb,
      mmr_after: ma,
      mmr_delta: delta,
      medal_before: pick('medal_before', body.medal_before),
      medal_after: pick('medal_after', body.medal_after),
      is_calibration: isCal,
      role_played: pick('role_played', body.role_played),
      is_milestone:
        body.is_milestone != null
          ? body.is_milestone
            ? 1
            : 0
          : pick('is_milestone', null, 0),
      tags: pick('tags', body.tags),
      updated_at: new Date().toISOString(),
    }

    if (prev) {
      db.prepare(
        `
        UPDATE match_annotations SET
          diary_entry=@diary_entry, mmr_before=@mmr_before, mmr_after=@mmr_after,
          mmr_delta=@mmr_delta, medal_before=@medal_before, medal_after=@medal_after,
          is_calibration=@is_calibration, role_played=@role_played,
          is_milestone=@is_milestone, tags=@tags, updated_at=@updated_at
        WHERE match_id=@match_id
      `
      ).run({ ...merged, match_id: matchId })
    } else {
      db.prepare(
        `
        INSERT INTO match_annotations (
          match_id, diary_entry, mmr_before, mmr_after, mmr_delta,
          medal_before, medal_after, is_calibration, role_played,
          is_milestone, tags, updated_at
        ) VALUES (
          @match_id, @diary_entry, @mmr_before, @mmr_after, @mmr_delta,
          @medal_before, @medal_after, @is_calibration, @role_played,
          @is_milestone, @tags, @updated_at
        )
      `
      ).run({ ...merged, match_id: matchId })
    }

    db.prepare('UPDATE matches SET my_role = ? WHERE match_id = ?').run(
      merged.role_played,
      matchId
    )

    const annotation = enrichAnnotation(
      rowToObject(
        db
          .prepare('SELECT * FROM match_annotations WHERE match_id = ?')
          .get(matchId)
      )
    )
    res.json(annotation)
  })

  router.get('/matches/:matchId/clips', (req, res) => {
    res.json({ clips: listClips(Number(req.params.matchId)) })
  })

  router.get('/journey', (req, res) => {
    const db = getDb()
    const limit = Math.min(Number(req.query.limit || 30), 100)
    const offset = Number(req.query.offset || 0)

    const rows = db
      .prepare(
        `
        SELECT m.match_id, m.start_time, m.duration, m.won, m.my_hero_name,
               m.my_kills, m.my_deaths, m.my_assists,
               COALESCE(a.role_played, m.my_role) AS role_played,
               m.game_mode_name,
               a.diary_entry, a.mmr_before, a.mmr_after, a.mmr_delta,
               a.medal_before, a.medal_after, a.is_calibration, a.is_milestone, a.tags
        FROM matches m
        LEFT JOIN match_annotations a ON a.match_id = m.match_id
        ORDER BY m.start_time DESC
        LIMIT ? OFFSET ?
      `
      )
      .all(limit, offset)

    let items = rows.map((d) => ({
      ...d,
      rank_up: medalRankUp(d.medal_before, d.medal_after),
      has_clips: listClips(d.match_id).length > 0,
      clip_count: listClips(d.match_id).length,
    }))

    if (req.query.rank_up_only === 'true') {
      items = items.filter((i) => i.rank_up)
    }
    if (req.query.has_diary === 'true') {
      items = items.filter((i) => (i.diary_entry || '').trim())
    }
    if (req.query.has_diary === 'false') {
      items = items.filter((i) => !(i.diary_entry || '').trim())
    }
    if (req.query.has_clips === 'true') {
      items = items.filter((i) => i.has_clips)
    }
    if (req.query.has_clips === 'false') {
      items = items.filter((i) => !i.has_clips)
    }

    res.json({ items, count: items.length })
  })

  router.get('/stats/summary', (_req, res) => {
    const db = getDb()
    const cfg = loadConfig()
    const base = db
      .prepare(
        `
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN won = 1 THEN 1 ELSE 0 END) AS wins,
               SUM(CASE WHEN won = 0 THEN 1 ELSE 0 END) AS losses
        FROM matches
      `
      )
      .get()

    const diary_count = db
      .prepare(
        `SELECT COUNT(*) AS c FROM match_annotations
         WHERE diary_entry IS NOT NULL AND trim(diary_entry) != ''`
      )
      .get().c

    const milestone_count = db
      .prepare(
        'SELECT COUNT(*) AS c FROM match_annotations WHERE is_milestone = 1'
      )
      .get().c

    const latest = rowToObject(
      db
        .prepare(
          `SELECT medal_after, mmr_after FROM match_annotations
           WHERE medal_after IS NOT NULL OR mmr_after IS NOT NULL
           ORDER BY updated_at DESC LIMIT 1`
        )
        .get()
    )

    const total = base.total || 0
    const wins = base.wins || 0
    let clip_match_count = 0
    if (fs.existsSync(cfg.clipsDirectory)) {
      clip_match_count = fs
        .readdirSync(cfg.clipsDirectory, { withFileTypes: true })
        .filter((d) => d.isDirectory() && listClips(d.name).length > 0).length
    }

    res.json({
      ...base,
      win_rate: total ? Math.round((wins / total) * 1000) / 1000 : 0,
      diary_count,
      milestone_count,
      clip_match_count,
      latest_medal: latest?.medal_after ?? null,
      latest_mmr: latest?.mmr_after ?? null,
      goal_medal: cfg.goalMedal,
    })
  })

  router.get('/stats/heroes', (_req, res) => {
    const db = getDb()
    const rows = db
      .prepare(
        `
        SELECT my_hero_name AS hero_name, COUNT(*) AS games, SUM(won) AS wins,
               ROUND(AVG(my_kills), 1) AS avg_kills,
               ROUND(AVG(my_deaths), 1) AS avg_deaths,
               ROUND(AVG(my_assists), 1) AS avg_assists
        FROM matches WHERE my_hero_name IS NOT NULL
        GROUP BY my_hero_name ORDER BY games DESC
      `
      )
      .all()
      .map((h) => ({
        ...h,
        win_rate: h.games ? Math.round((h.wins / h.games) * 1000) / 1000 : 0,
        avg_kda:
          h.avg_deaths > 0
            ? Math.round(((h.avg_kills + h.avg_assists) / h.avg_deaths) * 100) / 100
            : null,
      }))
    res.json({ heroes: rows })
  })

  router.get('/stats/roles', (_req, res) => {
    const db = getDb()
    const rows = db
      .prepare(
        `
        SELECT COALESCE(a.role_played, m.my_role, 'unassigned') AS role_played,
               COUNT(*) AS games, SUM(m.won) AS wins,
               ROUND(AVG(m.my_kills), 1) AS avg_kills,
               ROUND(AVG(m.my_deaths), 1) AS avg_deaths,
               ROUND(AVG(m.my_assists), 1) AS avg_assists,
               ROUND(AVG(a.mmr_delta), 1) AS avg_mmr_delta,
               SUM(CASE WHEN a.is_calibration = 1 THEN 1 ELSE 0 END) AS calibration_games
        FROM matches m
        LEFT JOIN match_annotations a ON a.match_id = m.match_id
        GROUP BY COALESCE(a.role_played, m.my_role, 'unassigned')
        ORDER BY games DESC
      `
      )
      .all()
      .map((r) => ({
        ...r,
        win_rate: r.games ? Math.round((r.wins / r.games) * 1000) / 1000 : 0,
      }))
    res.json({ roles: rows })
  })

  router.get('/stats/rank-progression', (req, res) => {
    const db = getDb()
    const includeCal = req.query.include_calibration !== 'false'
    const calFilter = includeCal ? '' : 'AND a.is_calibration = 0'
    const points = db
      .prepare(
        `
        SELECT m.match_id, m.start_time, a.mmr_before, a.mmr_after, a.mmr_delta,
               a.medal_before, a.medal_after, a.is_calibration
        FROM matches m
        INNER JOIN match_annotations a ON a.match_id = m.match_id
        WHERE (a.mmr_after IS NOT NULL OR a.mmr_before IS NOT NULL)
        ${calFilter}
        ORDER BY m.start_time ASC
      `
      )
      .all()
    res.json({ points })
  })

  return router
}

export { roleLabel }
