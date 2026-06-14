<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api/client'
import RankChart from '../components/RankChart.vue'

const summary = ref(null)
const rankPoints = ref([])
const error = ref(null)

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

const rankEvents = computed(() =>
  rankPoints.value.filter((p) => {
    if (p.rank_up || p.rank_down) return true
    if (p.is_calibration) return Boolean(p.medal_after?.trim())
    return false
  })
)

const chartPoints = computed(() =>
  rankPoints.value.filter((p) => !(p.is_calibration && !p.medal_after?.trim()))
)

const goalMedalInfo = computed(() => getMedalInfo('Legend 1'))

function formatShortDate(ts) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

function eventLabel(event) {
  if (event.is_calibration) return 'Cal'
  if (event.rank_up) return '↑'
  if (event.rank_down) return '↓'
  return ''
}

async function load() {
  error.value = null
  try {
    summary.value = await api.summary()
    const prog = await api.rankProgression(true)
    rankPoints.value = prog.points
  } catch (e) {
    error.value = e.message
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center">
      <h2>Dashboard</h2>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="summary" class="card goal-card">
      <div class="rank-card-layout">
        <div class="rank-current-section">
          <h3 class="rank-section-heading">Current</h3>
          <ul v-if="rankEvents.length" class="rank-progression-list">
            <li
              v-for="event in rankEvents"
              :key="event.match_id"
              class="rank-progression-item"
              :title="`${event.medal_after || '—'} · ${formatShortDate(event.start_time)}`"
            >
              <template v-if="event.medal_after && getMedalInfo(event.medal_after)">
                <span
                  class="medal-badge medal-badge--xs"
                  :style="{ backgroundImage: `url(${getMedalInfo(event.medal_after).backgroundUrl})` }"
                >
                  <img :src="getMedalInfo(event.medal_after).starUrl" :alt="event.medal_after" />
                </span>
              </template>
              <span v-else-if="event.medal_after" class="rank-progression-medal">{{ event.medal_after }}</span>
              <span v-else class="muted">—</span>
              <span class="rank-progression-date">{{ formatShortDate(event.start_time) }}</span>
              <span
                v-if="event.is_calibration"
                class="rank-event rank-event--calibration"
              >{{ eventLabel(event) }}</span>
              <span v-else-if="event.rank_up" class="rank-event rank-event--up">{{ eventLabel(event) }}</span>
              <span v-else-if="event.rank_down" class="rank-event rank-event--down">{{ eventLabel(event) }}</span>
            </li>
          </ul>
          <p v-else class="muted rank-empty">No rank changes recorded yet.</p>
        </div>

        <div class="rank-goal-section">
          <h3 class="rank-section-heading">Goal</h3>
          <div class="goal-display">
            <span v-if="goalMedalInfo" class="medal-display">
              <span
                class="medal-badge medal-badge--small"
                :style="{ backgroundImage: `url(${goalMedalInfo.backgroundUrl})` }"
              >
                <img :src="goalMedalInfo.starUrl" alt="Legend 1" />
              </span>
            </span>
            <strong v-else>Legend 1</strong>
          </div>
        </div>
      </div>
    </div>

    <div v-if="summary" class="grid-stats card">
      <div class="stat">
        <div class="value">{{ summary.total }}</div>
        <div class="label">Matches</div>
      </div>
      <div class="stat">
        <div
          :class="{
            'value-success': (summary.win_rate * 100) >= 50,
            'value-danger': (summary.win_rate * 100) < 50,
          }"
          class="value"
        >
          {{ (summary.win_rate * 100).toFixed(0) }}%
        </div>
        <div class="label">Win rate</div>
      </div>
      <div class="stat">
        <div class="value">
          <span class="value-success">{{ summary.wins }}</span>
          <span class="muted"> / </span>
          <span class="value-danger">{{ summary.losses }}</span>
        </div>
        <div class="label">W / L</div>
      </div>
      <div class="stat">
        <div class="value">{{ summary.diary_count }}</div>
        <div class="label">Diary entries</div>
      </div>
      <div class="stat">
        <div class="value">{{ summary.milestone_count }}</div>
        <div class="label">Milestones</div>
      </div>
      <div class="stat">
        <div class="value">{{ summary.clip_match_count }}</div>
        <div class="label">Matches w/ clips</div>
      </div>
    </div>

    <div v-if="summary?.splits?.length" class="card">
      <h3 style="margin-top: 0">Splits</h3>
      <div class="table-scroll">
        <table>
        <thead>
          <tr>
            <th>Window</th>
            <th>W / L</th>
            <th>Win rate</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="split in summary.splits" :key="split.window">
            <td>Last {{ split.window }}</td>
            <td>
              <template v-if="split.games">
                <span class="value-success">{{ split.wins }}</span>
                /
                <span class="value-danger">{{ split.losses }}</span>
              </template>
              <span v-else class="value-muted">—</span>
            </td>
            <td>
              <span
                v-if="split.games"
                :class="{
                  'value-success': split.win_rate >= 0.5,
                  'value-danger': split.win_rate < 0.5,
                }"
              >
                {{ (split.win_rate * 100).toFixed(0) }}%
              </span>
              <span v-else class="value-muted">—</span>
            </td>
          </tr>
        </tbody>
        </table>
      </div>
      <p class="muted">Win/loss over your most recent matches by start time.</p>
    </div>

    <div class="card">
      <h3 style="margin-top: 0">Rank progression</h3>
      <RankChart :points="chartPoints" />
      <p class="muted">Green = rank up, red = rank down, orange = calibration. Calibration games without a medal are omitted.</p>
    </div>
  </div>
</template>
