<script setup>
import { onMounted, ref } from 'vue'
import { api } from '../api/client'
import RankChart from '../components/RankChart.vue'

const summary = ref(null)
const rankPoints = ref([])
const error = ref(null)
const syncing = ref(false)

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

async function runSync() {
  syncing.value = true
  error.value = null
  try {
    await api.sync(false)
    await load()
  } catch (e) {
    error.value = e.message
  } finally {
    syncing.value = false
  }
}

async function runReset() {
  syncing.value = true
  error.value = null
  try {
    await api.reset()
    await load()
  } catch (e) {
    error.value = e.message
  } finally {
    syncing.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center">
      <h2>Dashboard</h2>
      <div class="dashboard-actions" style="display: flex; gap: 0.75rem; align-items: center">
        <button class="btn primary" :disabled="syncing" @click="runSync">
          {{ syncing ? 'Syncing…' : 'Sync matches' }}
        </button>
        <button class="btn" :disabled="syncing" @click="runReset">
          {{ syncing ? 'Resetting…' : 'Reset + resync' }}
        </button>
      </div>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="summary" class="card goal-card">
      <h3 style="margin-top: 0">Goal: {{ summary.goal_medal }}</h3>
      <p>
        Current:
        <strong>{{ summary.latest_medal || '—' }}</strong>
        <span v-if="summary.latest_mmr != null">
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
        <div class="value">{{ (summary.win_rate * 100).toFixed(0) }}%</div>
        <div class="label">Win rate</div>
      </div>
      <div class="stat">
        <div class="value">{{ summary.wins }} / {{ summary.losses }}</div>
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

    <div class="card">
      <h3 style="margin-top: 0">Rank progression</h3>
      <RankChart :points="rankPoints" />
      <p class="muted">Orange points = calibration (0 MMR change). All annotated games included.</p>
    </div>
  </div>
</template>
