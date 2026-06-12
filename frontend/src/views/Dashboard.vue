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

const latestMedalInfo = computed(() => {
  return summary.value ? getMedalInfo(summary.value.latest_medal) : null
})

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
      <h3 style="margin-top: 0">Goal: {{ summary.goal_medal }}</h3>
      <p class="goal-current">
        <span class="goal-current-label">Current:</span>
        <template v-if="summary.latest_medal">
          <span v-if="latestMedalInfo" class="medal-display">
            <span class="medal-badge" :style="{ backgroundImage: `url(${latestMedalInfo.backgroundUrl})` }">
              <img :src="latestMedalInfo.starUrl" :alt="summary.latest_medal" />
            </span>
          </span>
          <strong v-else>{{ summary.latest_medal }}</strong>
        </template>
        <strong v-else>—</strong>
        <span v-if="summary.latest_mmr != null" class="goal-current-mmr">
          · {{ summary.latest_mmr }} MMR
        </span>
      </p>
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
      <RankChart :points="rankPoints" />
      <p class="muted">Green = rank up, red = rank down, orange = calibration. All annotated games included.</p>
    </div>
  </div>
</template>
