import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { resolvePythonExecutable } from '../scripts/python-env.js'
import express from 'express'
import { loadConfig, VALID_ROLES, roleLabel, ROOT } from './config.js'
import { getDb, rowToObject } from './db.js'
import { routeHandler } from './middleware.js'
import {
  clipSummaryForMatch,
  getClipCountsByMatchId,
  listClips,
  resolveClipPath,
} from './clips.js'

const MATCH_LIST_COLUMNS = `
  m.match_id, m.match_seq_num, m.start_time, m.duration, m.won,
  m.my_hero_name, m.my_hero_id, m.my_kills, m.my_deaths, m.my_assists,
  m.my_role, m.game_mode_name,
  a.diary_entry, a.mmr_before, a.mmr_after, a.mmr_delta,
  a.medal_before, a.medal_after, a.is_calibration, a.is_milestone, a.role_played,
  COALESCE(a.role_played, m.my_role) AS effective_role
`

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const MEDAL_ORDER = {
  Herald: 1,
  Guardian: 2,
  Crusader: 3,
  Archon: 4,
  Legend: 5,
}

const MEDAL_BRACKETS = Object.keys(MEDAL_ORDER)

function medalBracketName(medal) {
  if (!medal) return null
  const match = medal.trim().match(/^([A-Za-z]+)\s+[1-5]$/)
  if (!match) return null
  return MEDAL_BRACKETS.includes(match[1]) ? match[1] : null
}

function listMedalBracketsInData(db) {
  const rows = db
    .prepare(
      `SELECT DISTINCT medal_before FROM match_annotations
       WHERE medal_before IS NOT NULL AND TRIM(medal_before) != ''`
    )
    .all()
  const found = new Set()
  for (const row of rows) {
    const bracket = medalBracketName(row.medal_before)
    if (bracket) found.add(bracket)
  }
  return MEDAL_BRACKETS.filter((b) => found.has(b))
}

function parseMedal(medal) {
  if (!medal) return null
  const match = medal.trim().match(/^([A-Za-z]+)\s+([1-5])$/)
  if (!match) return null

  const tier = MEDAL_ORDER[match[1]]
  const star = Number(match[2])
  return tier ? { tier, star } : null
}

function medalRankUp(before, after) {
  const b = parseMedal(before)
  const a = parseMedal(after)
  if (!b || !a) return false
  if (a.tier !== b.tier) return a.tier > b.tier
  return a.star > b.star
}

function medalRankDown(before, after) {
  const b = parseMedal(before)
  const a = parseMedal(after)
  if (!b || !a) return false
  if (a.tier !== b.tier) return a.tier < b.tier
  return a.star < b.star
}

function medalSortValue(medal) {
  const parsed = parseMedal(medal)
  if (!parsed) return -1
  return parsed.tier * 10 + parsed.star
}

const MATCH_SORT_GETTERS = {
  start_time: (m) => m.start_time ?? 0,
  match_id: (m) => m.match_id ?? 0,
  hero: (m) => (m.my_hero_name || '').toLowerCase(),
  kills: (m) => m.my_kills ?? 0,
  deaths: (m) => m.my_deaths ?? 0,
  assists: (m) => m.my_assists ?? 0,
  role: (m) => (m.effective_role || m.my_role || '').toLowerCase(),
  medal_before: (m) => medalSortValue(m.medal_before),
  medal_after: (m) => medalSortValue(m.medal_after),
  won: (m) => m.won ?? 0,
  mmr_delta: (m) => (m.mmr_delta == null ? -Infinity : m.mmr_delta),
}

function compareMatchSortValues(a, b) {
  const aNull = a == null || a === ''
  const bNull = b == null || b === ''
  if (aNull && bNull) return 0
  if (aNull) return 1
  if (bNull) return -1
  if (typeof a === 'number' && typeof b === 'number') {
    if (a < b) return -1
    if (a > b) return 1
    return 0
  }
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' })
}

function sortMatches(matches, sortKey, order) {
  const getter = MATCH_SORT_GETTERS[sortKey] || MATCH_SORT_GETTERS.start_time
  const direction = order === 'asc' ? 1 : -1
  return matches.slice().sort((left, right) => {
    const cmp = compareMatchSortValues(getter(left), getter(right))
    return cmp * direction
  })
}

function enrichAnnotation(row) {
  if (!row) return null
  const d = { ...row }
  if (d.mmr_before != null && d.mmr_after != null && d.mmr_delta == null) {
    d.mmr_delta = d.mmr_after - d.mmr_before
  }
  d.rank_up = medalRankUp(d.medal_before, d.medal_after)
  d.rank_down = medalRankDown(d.medal_before, d.medal_after)
  return d
}

function getPreviousCompletedAnnotation(db, matchId) {
  return rowToObject(
    db
      .prepare(
        `SELECT match_id, mmr_after, medal_after
         FROM match_annotations
         WHERE match_id < ?
           AND (mmr_after IS NOT NULL OR medal_after IS NOT NULL)
         ORDER BY match_id DESC
         LIMIT 1`
      )
      .get(matchId)
  )
}

function prepopulateMatchBeforeValues(annotation, db, matchId) {
  const existing = annotation ? { ...annotation } : {}
  const needsMmrBefore = existing.mmr_before == null
  const needsMedalBefore = existing.medal_before == null
  const needsMedalAfter = existing.medal_after == null
  if (!needsMmrBefore && !needsMedalBefore && !needsMedalAfter) return existing

  const prev = getPreviousCompletedAnnotation(db, matchId)
  if (!prev) return existing

  if (needsMmrBefore && prev.mmr_after != null) existing.mmr_before = prev.mmr_after
  if (needsMedalBefore && prev.medal_after != null) existing.medal_before = prev.medal_after
  if (needsMedalAfter) {
    if (existing.medal_before != null) existing.medal_after = existing.medal_before
    else if (prev.medal_after != null) existing.medal_after = prev.medal_after
  }
  return existing
}

let heroMetadataCache = null
let heroMetadataFetchedAt = 0
const HERO_METADATA_TTL_MS = 24 * 60 * 60 * 1000

function formatHeroStats(rows) {
  return rows.map((h) => ({
    ...h,
    win_rate: h.games ? Math.round((h.wins / h.games) * 1000) / 1000 : 0,
    avg_kda:
      h.avg_deaths > 0
        ? Math.round(((h.avg_kills + h.avg_assists) / h.avg_deaths) * 100) / 100
        : null,
  }))
}

const RECENT_SPLIT_WINDOWS = [5, 10, 25, 50]

function computeRecentSplits(db) {
  const recent = db
    .prepare('SELECT won FROM matches ORDER BY start_time DESC LIMIT 50')
    .all()

  return RECENT_SPLIT_WINDOWS.map((window) => {
    const slice = recent.slice(0, window)
    const games = slice.length
    const wins = slice.reduce((sum, m) => sum + (m.won ? 1 : 0), 0)
    const losses = games - wins
    return {
      window,
      games,
      wins,
      losses,
      win_rate: games ? Math.round((wins / games) * 1000) / 1000 : 0,
    }
  })
}

const TEAMMATE_HERO_STATS_SQL = `
  SELECT mp.hero_name, COUNT(*) AS games, SUM(mp.won) AS wins,
         ROUND(AVG(mp.kills), 1) AS avg_kills,
         ROUND(AVG(mp.deaths), 1) AS avg_deaths,
         ROUND(AVG(mp.assists), 1) AS avg_assists
  FROM match_players mp
  JOIN match_players me ON me.match_id = mp.match_id AND me.is_me = 1
  WHERE mp.is_me = 0
    AND mp.team = me.team
    AND mp.hero_name IS NOT NULL
  GROUP BY mp.hero_name
`

const ENEMY_HERO_STATS_SQL = `
  SELECT mp.hero_name, COUNT(*) AS games, SUM(me.won) AS wins,
         ROUND(AVG(mp.kills), 1) AS avg_kills,
         ROUND(AVG(mp.deaths), 1) AS avg_deaths,
         ROUND(AVG(mp.assists), 1) AS avg_assists
  FROM match_players mp
  JOIN match_players me ON me.match_id = mp.match_id AND me.is_me = 1
  WHERE mp.is_me = 0
    AND mp.team != me.team
    AND mp.hero_name IS NOT NULL
  GROUP BY mp.hero_name
`

function metaHeroStatsSql(medalBracket) {
  const annotationJoin = medalBracket
    ? 'JOIN match_annotations a ON a.match_id = mp.match_id\n  '
    : ''
  const medalFilter = medalBracket
    ? '    AND a.medal_before LIKE @medalPrefix\n'
    : ''
  return `
  SELECT mp.hero_name, COUNT(*) AS games, SUM(mp.won) AS wins,
         ROUND(AVG(mp.kills), 1) AS avg_kills,
         ROUND(AVG(mp.deaths), 1) AS avg_deaths,
         ROUND(AVG(mp.assists), 1) AS avg_assists
  FROM match_players mp
  ${annotationJoin}JOIN match_players me ON me.match_id = mp.match_id AND me.is_me = 1
  WHERE mp.is_me = 0
    AND mp.hero_name IS NOT NULL
    AND mp.hero_name != me.hero_name
${medalFilter}  GROUP BY mp.hero_name
`
}

async function loadHeroMetadata() {
  const response = await fetch('https://api.opendota.com/api/heroes')
  if (!response.ok) {
    throw new Error(`OpenDota heroes HTTP ${response.status}`)
  }
  const heroes = await response.json()
  const payload = {
    heroes: (heroes || []).map((h) => ({
      id: h.id,
      name: h.name,
      localized_name: h.localized_name,
    })),
  }
  heroMetadataCache = payload
  heroMetadataFetchedAt = Date.now()
  return payload
}

export function createRouter() {
  const router = express.Router()
  const get = (path, fn) => router.get(path, routeHandler(fn))
  const post = (path, fn) => router.post(path, routeHandler(fn))
  const put = (path, ...handlers) => {
    const fn = handlers.pop()
    router.put(path, ...handlers, routeHandler(fn))
  }

  get('/health', (_req, res) => res.json({ status: 'ok' }))

  get('/config/public', (_req, res) => {
    const c = loadConfig()
    res.json({
      goal_medal: c.goalMedal,
      cutoff_date: c.cutoffDate,
      account_id: c.accountId,
      sync_source: c.syncSource,
    })
  })

  get('/hero-metadata', async (_req, res) => {
    const stale =
      heroMetadataCache &&
      Date.now() - heroMetadataFetchedAt < HERO_METADATA_TTL_MS
    if (stale) {
      return res.json(heroMetadataCache)
    }

    try {
      res.json(await loadHeroMetadata())
    } catch (err) {
      if (heroMetadataCache) {
        console.warn('[api] hero-metadata fetch failed, using cache:', err.message)
        return res.json(heroMetadataCache)
      }
      console.warn('[api] hero-metadata fetch failed:', err.message)
      res.json({ heroes: [] })
    }
  })

  post('/sync', (req, res) => {
    const force = req.query.force === 'true'
    const python = resolvePythonExecutable()
    const py = spawn(python, ['run_sync.py', ...(force ? ['--force'] : [])], {
      cwd: ROOT,
      shell: false,
    })

    let out = ''
    let err = ''
    req.setTimeout(0)
    py.stdout.on('data', (d) => { out += d.toString() })
    py.stderr.on('data', (d) => { err += d.toString() })
    py.on('close', (code) => {
      if (code !== 0) {
        return res.status(500).json({ ok: false, detail: err || out || `exit ${code}` })
      }
      res.json({ ok: true, message: out.trim() || 'Sync complete' })
    })
  })

  get('/matches', (req, res) => {
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
    if (req.query.is_milestone === 'true') {
      clauses.push('a.is_milestone = 1')
    } else if (req.query.is_milestone === 'false') {
      clauses.push('(a.is_milestone IS NULL OR a.is_milestone = 0)')
    }

    const sortKey = MATCH_SORT_GETTERS[req.query.sort] ? req.query.sort : 'start_time'
    const order = req.query.order === 'asc' ? 'asc' : 'desc'
    const limit = Math.min(Number(req.query.limit || 50), 200)
    const offset = Number(req.query.offset || 0)

    const rows = db
      .prepare(
        `
        SELECT ${MATCH_LIST_COLUMNS}
        FROM matches m
        LEFT JOIN match_annotations a ON a.match_id = m.match_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY m.start_time DESC
      `
      )
      .all(...params)

    const clipCounts = getClipCountsByMatchId()
    let matches = rows.map((m) => ({
      ...m,
      ...clipSummaryForMatch(m.match_id, clipCounts),
      rank_up: medalRankUp(m.medal_before, m.medal_after),
      rank_down: medalRankDown(m.medal_before, m.medal_after),
      has_diary: !!((m.diary_entry || '').toString().trim()),
      is_milestone: !!m.is_milestone,
    }))

    if (req.query.has_clips === 'true') {
      matches = matches.filter((m) => m.has_clips)
    } else if (req.query.has_clips === 'false') {
      matches = matches.filter((m) => !m.has_clips)
    }

    if (req.query.has_diary === 'false') {
      matches = matches.filter((m) => !m.has_diary)
    }

    if (req.query.is_milestone === 'true') {
      matches = matches.filter((m) => m.is_milestone)
    } else if (req.query.is_milestone === 'false') {
      matches = matches.filter((m) => !m.is_milestone)
    }

    if (req.query.rank_up === 'true') {
      matches = matches.filter((m) => m.rank_up)
    } else if (req.query.rank_up === 'false') {
      matches = matches.filter((m) => !m.rank_up)
    }

    if (req.query.rank_down === 'true') {
      matches = matches.filter((m) => m.rank_down)
    } else if (req.query.rank_down === 'false') {
      matches = matches.filter((m) => !m.rank_down)
    }

    matches = sortMatches(matches, sortKey, order)

    const count = matches.length
    const pagedMatches = matches.slice(offset, offset + limit)

    res.json({ matches: pagedMatches, count })
  })

  get('/matches/:matchId', (req, res) => {
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

  put('/matches/:matchId/annotation', express.json(), (req, res) => {
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

  get('/matches/:matchId/clips', (req, res) => {
    res.json({ clips: listClips(Number(req.params.matchId)) })
  })

  get('/journey', (req, res) => {
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

    const clipCounts = getClipCountsByMatchId()
    let items = rows.map((d) => ({
      ...d,
      rank_up: medalRankUp(d.medal_before, d.medal_after),
      rank_down: medalRankDown(d.medal_before, d.medal_after),
      ...clipSummaryForMatch(d.match_id, clipCounts),
    }))

    if (req.query.rank_up_only === 'true') {
      items = items.filter((i) => i.rank_up)
    }
    if (req.query.rank_down_only === 'true') {
      items = items.filter((i) => i.rank_down)
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

  get('/stats/summary', (_req, res) => {
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

    // Use the annotation for the most recent match by match_id (greatest id)
    const lastMatch = db.prepare('SELECT MAX(match_id) AS max_id FROM matches').get()
    const lastMatchId = lastMatch ? lastMatch.max_id : null
    let latest = null
    if (lastMatchId != null) {
      latest = rowToObject(
        db
          .prepare(
            `SELECT medal_after, mmr_after FROM match_annotations
             WHERE match_id = ?`
          )
          .get(lastMatchId)
      )
    }

    const total = base.total || 0
    const wins = base.wins || 0
    const clip_match_count = getClipCountsByMatchId().size

    res.json({
      ...base,
      win_rate: total ? Math.round((wins / total) * 1000) / 1000 : 0,
      diary_count,
      milestone_count,
      clip_match_count,
      latest_medal: latest?.medal_after ?? null,
      latest_mmr: latest?.mmr_after ?? null,
      goal_medal: cfg.goalMedal,
      splits: computeRecentSplits(db),
    })
  })

  get('/stats/heroes', (_req, res) => {
    const db = getDb()
    const rows = formatHeroStats(
      db
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
    )
    res.json({ heroes: rows })
  })

  get('/stats/teammates', (_req, res) => {
    const db = getDb()
    const rows = formatHeroStats(
      db.prepare(`${TEAMMATE_HERO_STATS_SQL} ORDER BY games DESC`).all()
    )
    res.json({ heroes: rows })
  })

  get('/stats/enemies', (_req, res) => {
    const db = getDb()
    const rows = formatHeroStats(
      db.prepare(`${ENEMY_HERO_STATS_SQL} ORDER BY games DESC`).all()
    )
    res.json({ heroes: rows })
  })

  get('/stats/meta', (req, res) => {
    const db = getDb()
    const bracket = (req.query.medal_bracket || '').trim() || null
    if (bracket && !MEDAL_BRACKETS.includes(bracket)) {
      return res.status(400).json({
        detail: `Invalid medal_bracket. Use one of: ${MEDAL_BRACKETS.join(', ')}`,
      })
    }

    const params = bracket ? { medalPrefix: `${bracket} %` } : {}
    const rows = formatHeroStats(
      db
        .prepare(`${metaHeroStatsSql(bracket)} ORDER BY games DESC`)
        .all(params)
    )
    res.json({
      heroes: rows,
      medal_bracket: bracket,
      medal_brackets: MEDAL_BRACKETS,
      medal_brackets_in_data: listMedalBracketsInData(db),
    })
  })

  get('/stats/roles', (_req, res) => {
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

  get('/stats/rank-progression', (req, res) => {
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
        WHERE (
          a.mmr_after IS NOT NULL OR a.mmr_before IS NOT NULL
          OR a.is_calibration = 1
          OR (
            a.medal_before IS NOT NULL AND TRIM(a.medal_before) != ''
            AND a.medal_after IS NOT NULL AND TRIM(a.medal_after) != ''
            AND a.medal_before != a.medal_after
          )
        )
        ${calFilter}
        ORDER BY m.start_time ASC
      `
      )
      .all()
      .map((p) => ({
        ...p,
        rank_up: medalRankUp(p.medal_before, p.medal_after),
        rank_down: medalRankDown(p.medal_before, p.medal_after),
      }))
    res.json({ points })
  })

  return router
}

export { roleLabel }
