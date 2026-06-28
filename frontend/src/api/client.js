const BASE = ''
const RETRYABLE_STATUSES = new Set([502, 503, 504])
const MAX_RETRIES = 3

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function request(path, options = {}, attempt = 0) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    })
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await wait(250 * (attempt + 1))
      return request(path, options, attempt + 1)
    }
    throw err
  }

  if (!res.ok && RETRYABLE_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
    await wait(250 * (attempt + 1))
    return request(path, options, attempt + 1)
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

export const api = {
  health: () => request('/api/health'),
  publicConfig: () => request('/api/config/public'),
  matches: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/api/matches?${q}`)
  },
  match: (id, includeRaw = false) =>
    request(`/api/matches/${id}?include_raw=${includeRaw}`),
  saveAnnotation: (id, body) =>
    request(`/api/matches/${id}/annotation`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  journey: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/api/journey?${q}`)
  },
  summary: () => request('/api/stats/summary'),
  matchWindows: (window = 25) => request(`/api/stats/match-windows?window=${window}`),
  heroes: () => request('/api/stats/heroes'),
  teammates: () => request('/api/stats/teammates'),
  enemies: () => request('/api/stats/enemies'),
  meta: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/api/stats/meta${q ? `?${q}` : ''}`)
  },
  heroMetadata: () => request('/api/hero-metadata'),
  roles: () => request('/api/stats/roles'),
  rankProgression: (includeCalibration = true) =>
    request(
      `/api/stats/rank-progression?include_calibration=${includeCalibration}`
    ),
}

const HERO_IMAGE_BASE = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes'
const heroSlugById = new Map()
const heroSlugByName = new Map()

export async function ensureHeroMetadata() {
  if (heroSlugById.size || heroSlugByName.size) return
  try {
    const data = await api.heroMetadata()
    for (const hero of data.heroes || []) {
      const id = Number(hero.id)
      const slug = (hero.name || '').replace(/^npc_dota_hero_/, '')
      const name = hero.localized_name || hero.name
      if (id && slug) {
        heroSlugById.set(id, slug)
      }
      if (name && slug) {
        heroSlugByName.set(name, slug)
      }
    }
  } catch {
    // ignore metadata failures and fall back to slug generation
  }
}

export function heroImageUrl(hero) {
  if (hero == null || hero === '') return null
  let slug = null
  if (typeof hero === 'number') {
    slug = heroSlugById.get(hero)
  } else if (/^\d+$/.test(String(hero))) {
    slug = heroSlugById.get(Number(hero))
  } else {
    slug = heroSlugByName.get(String(hero))
  }
  const normalized =
    slug ||
    String(hero)
      .toLowerCase()
      .replace(/^npc_dota_hero_/, '')
      .replace(/[^a-z0-9]/g, '')
  return `${HERO_IMAGE_BASE}/${normalized}.png`
}

export function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function formatDuration(sec) {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export const ROLES = [
  { value: 'carry', label: 'Carry' },
  { value: 'mid', label: 'Mid' },
  { value: 'offlane', label: 'Offlane' },
  { value: 'soft_support', label: 'Soft Support' },
  { value: 'hard_support', label: 'Hard Support' },
]

export function roleLabel(v) {
  return ROLES.find((r) => r.value === v)?.label || v || '—'
}
