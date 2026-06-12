<script setup>
import { onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import SortableTh from '../components/SortableTh.vue'
import {
  api,
  ensureHeroMetadata,
  formatDate,
  formatDuration,
  heroImageUrl,
  roleLabel,
  ROLES,
} from '../api/client'

const matches = ref([])
const error = ref(null)
const heroOptions = ref([])
const sortKey = ref('start_time')
const sortOrder = ref('desc')

const RANK_ICON_BASE = 'https://www.opendota.com/assets/images/dota2/rank_icons'
const MEDAL_ICON_INDEX = {
  Herald: 1,
  Guardian: 2,
  Crusader: 3,
  Archon: 4,
  Legend: 5,
}

function getMedalInfo(medal) {
  if (!medal) return null
  const match = medal.trim().match(/^([A-Za-z]+)\s+([1-5])$/)
  if (!match) return null

  const tier = match[1]
  const star = match[2]
  const iconId = MEDAL_ICON_INDEX[tier]
  if (!iconId) return null

  return {
    backgroundUrl: `${RANK_ICON_BASE}/rank_icon_${iconId}.png`,
    starUrl: `${RANK_ICON_BASE}/rank_star_${star}.png`,
  }
}
const hero = ref('')
const role = ref('')
const hasClips = ref('')
const hasDiary = ref('')
const isMilestone = ref('')
const rankUp = ref('')
const rankDown = ref('')
const page = ref(1)
const pageSize = 50
const hasNextPage = ref(false)

async function loadHeroOptions() {
  try {
    const data = await api.heroMetadata()
    heroOptions.value = (data.heroes || []).slice().sort((a, b) =>
      String(a.localized_name || a.name).localeCompare(String(b.localized_name || b.name))
    )
  } catch {
    heroOptions.value = []
  }
}

async function load() {
  error.value = null
  try {
    await ensureHeroMetadata()
    if (!heroOptions.value.length) {
      await loadHeroOptions()
    }
    const params = {
      limit: pageSize,
      offset: (page.value - 1) * pageSize,
      sort: sortKey.value,
      order: sortOrder.value,
    }
    if (hero.value) params.hero = hero.value
    if (role.value) params.role = role.value
    if (hasClips.value) params.has_clips = hasClips.value
    if (hasDiary.value) params.has_diary = hasDiary.value
    if (isMilestone.value) params.is_milestone = isMilestone.value
    if (rankUp.value) params.rank_up = rankUp.value
    if (rankDown.value) params.rank_down = rankDown.value
    const data = await api.matches(params)
    matches.value = data.matches
    hasNextPage.value = data.matches.length === pageSize
  } catch (e) {
    error.value = e.message
  }
}

function goToPreviousPage() {
  if (page.value > 1) {
    page.value -= 1
    load()
  }
}

function goToNextPage() {
  if (hasNextPage.value) {
    page.value += 1
    load()
  }
}

const MATCH_SORT_DEFAULTS = {
  start_time: 'desc',
  match_id: 'desc',
  hero: 'asc',
  kills: 'desc',
  role: 'asc',
  medal_before: 'desc',
  medal_after: 'desc',
  won: 'desc',
  mmr_delta: 'desc',
}

function toggleSort(column) {
  if (sortKey.value === column) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = column
    sortOrder.value = MATCH_SORT_DEFAULTS[column] || 'asc'
  }
  page.value = 1
  load()
}

function sortDirection(column) {
  return sortKey.value === column ? sortOrder.value : null
}

watch([hero, role, hasClips, hasDiary, isMilestone, rankUp, rankDown], () => {
  page.value = 1
  load()
})

onMounted(async () => {
  await loadHeroOptions()
  load()
})
</script>

<template>
  <div>
    <h2>Matches</h2>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="filters">
      <label>
        Hero
        <select v-model="hero">
          <option value="">All heroes</option>
          <option v-for="h in heroOptions" :key="h.id" :value="h.localized_name">
            {{ h.localized_name }}
          </option>
        </select>
      </label>
      <label>
        Role
        <select v-model="role">
          <option value="">All roles</option>
          <option v-for="r in ROLES" :key="r.value" :value="r.value">
            {{ r.label }}
          </option>
        </select>
      </label>
      <label>
        Has clips
        <select v-model="hasClips">
          <option value="">Any</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </label>
      <label>
        Has diary
        <select v-model="hasDiary">
          <option value="">Any</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </label>
      <label>
        Milestone
        <select v-model="isMilestone">
          <option value="">Any</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </label>
      <label>
        Rank up
        <select v-model="rankUp">
          <option value="">Any</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </label>
      <label>
        Rank down
        <select v-model="rankDown">
          <option value="">Any</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </label>
    </div>

    <table v-if="matches.length" class="card" style="padding: 0; overflow: hidden">
      <thead>
        <tr>
          <SortableTh
            label="Date"
            column="start_time"
            :active-column="sortKey"
            :direction="sortDirection('start_time')"
            @sort="toggleSort"
          />
          <SortableTh
            label="Hero"
            column="hero"
            :active-column="sortKey"
            :direction="sortDirection('hero')"
            @sort="toggleSort"
          />
          <SortableTh
            label="KDA"
            column="kills"
            :active-column="sortKey"
            :direction="sortDirection('kills')"
            @sort="toggleSort"
          />
          <SortableTh
            label="Role"
            column="role"
            :active-column="sortKey"
            :direction="sortDirection('role')"
            @sort="toggleSort"
          />
          <SortableTh
            label="Rank before"
            column="medal_before"
            :active-column="sortKey"
            :direction="sortDirection('medal_before')"
            @sort="toggleSort"
          />
          <SortableTh
            label="Rank after"
            column="medal_after"
            :active-column="sortKey"
            :direction="sortDirection('medal_after')"
            @sort="toggleSort"
          />
          <SortableTh
            label="Result"
            column="won"
            :active-column="sortKey"
            :direction="sortDirection('won')"
            @sort="toggleSort"
          />
          <SortableTh
            label="MMR Δ"
            column="mmr_delta"
            :active-column="sortKey"
            :direction="sortDirection('mmr_delta')"
            @sort="toggleSort"
          />
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="m in matches" :key="m.match_id">
          <td>{{ formatDate(m.start_time) }}</td>
          <td>
            <RouterLink class="hero-cell" :to="`/matches/${m.match_id}`">
              <img
                v-if="m.my_hero_id || m.my_hero_name"
                :src="heroImageUrl(m.my_hero_id || m.my_hero_name)"
                :alt="m.my_hero_name || m.my_hero_id"
                class="hero-icon"
              />
              <span>{{ m.my_hero_name || m.my_hero_id || '—' }}</span>
            </RouterLink>
          </td>
          <td>
            <span class="value-success">{{ m.my_kills }}</span>
            <span class="muted">/</span>
            <span class="value-danger">{{ m.my_deaths }}</span>
            <span class="muted">/</span>
            <span class="value-muted">{{ m.my_assists }}</span>
          </td>
          <td>{{ roleLabel(m.my_role || m.role_played) }}</td>
          <td>
            <template v-if="m.medal_before">
              <span v-if="getMedalInfo(m.medal_before)" class="medal-display small">
                <span
                  class="medal-badge medal-badge--small"
                  :style="{ backgroundImage: `url(${getMedalInfo(m.medal_before).backgroundUrl})` }"
                >
                  <img :src="getMedalInfo(m.medal_before).starUrl" :alt="m.medal_before" />
                </span>
              </span>
              <span v-else>{{ m.medal_before }}</span>
            </template>
            <span v-else>—</span>
          </td>
          <td>
            <template v-if="m.medal_after">
              <span v-if="getMedalInfo(m.medal_after)" class="medal-display small">
                <span
                  class="medal-badge medal-badge--small"
                  :style="{ backgroundImage: `url(${getMedalInfo(m.medal_after).backgroundUrl})` }"
                >
                  <img :src="getMedalInfo(m.medal_after).starUrl" :alt="m.medal_after" />
                </span>
              </span>
              <span v-else>{{ m.medal_after }}</span>
            </template>
            <span v-else>—</span>
          </td>
          <td>
            <span :class="['badge', m.won ? 'win' : 'loss']">
              {{ m.won ? 'W' : 'L' }}
            </span>
          </td>
          <td>
            <span
              v-if="m.mmr_delta != null"
              :class="{
                'value-success': m.mmr_delta > 0,
                'value-danger': m.mmr_delta < 0,
              }"
            >
              {{ m.mmr_delta >= 0 ? '+' : '' }}{{ m.mmr_delta }}
            </span>
            <span v-else>—</span>
          </td>
          <td>
            <span class="match-actions">
              <span v-if="m.has_clips" class="badge clip">Clip</span>
              <span v-if="m.rank_up" class="badge win">Rank up</span>
              <span v-if="m.rank_down" class="badge loss">Rank down</span>
              <span
                v-if="m.has_diary || m.is_milestone"
                :class="['badge', m.is_milestone ? 'milestone' : 'diary']"
              >
                {{ m.has_diary ? 'Diary' : 'Milestone' }}
              </span>
            </span>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="matches.length" class="pagination">
      <button class="btn" :disabled="page === 1" @click="goToPreviousPage">
        Previous
      </button>
      <span class="muted">Page {{ page }}</span>
      <button class="btn" :disabled="!hasNextPage" @click="goToNextPage">
        Next
      </button>
    </div>

    <p v-else-if="!error" class="muted">No matches found.</p>
  </div>
</template>
