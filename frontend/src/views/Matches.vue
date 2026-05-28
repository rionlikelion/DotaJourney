<script setup>
import { onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
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
const hero = ref('')
const role = ref('')
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
    }
    if (hero.value) params.hero = hero.value
    if (role.value) params.role = role.value
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

watch([hero, role], () => {
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
    </div>

    <table v-if="matches.length" class="card" style="padding: 0; overflow: hidden">
      <thead>
        <tr>
          <th>Date</th>
          <th>Hero</th>
          <th>KDA</th>
          <th>Role</th>
          <th>Rank before</th>
          <th>MMR before</th>
          <th>Result</th>
          <th>MMR Δ</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="m in matches" :key="m.match_id">
          <td>{{ formatDate(m.start_time) }}</td>
          <td>
            <span class="hero-cell">
              <img
                v-if="m.my_hero_id || m.my_hero_name"
                :src="heroImageUrl(m.my_hero_id || m.my_hero_name)"
                :alt="m.my_hero_name || m.my_hero_id"
                class="hero-icon"
              />
              <span>{{ m.my_hero_name || m.my_hero_id || '—' }}</span>
            </span>
          </td>
          <td>{{ m.my_kills }}/{{ m.my_deaths }}/{{ m.my_assists }}</td>
          <td>{{ roleLabel(m.my_role || m.role_played) }}</td>
          <td>{{ m.medal_before || '—' }}</td>
          <td>{{ m.mmr_before != null ? m.mmr_before : '—' }}</td>
          <td>
            <span :class="['badge', m.won ? 'win' : 'loss']">
              {{ m.won ? 'W' : 'L' }}
            </span>
          </td>
          <td>
            <span v-if="m.mmr_delta != null">{{ m.mmr_delta >= 0 ? '+' : '' }}{{ m.mmr_delta }}</span>
            <span v-else>—</span>
          </td>
          <td>
            <span class="match-actions">
              <span v-if="m.has_clips" class="badge clip">clip</span>
              <RouterLink :to="`/matches/${m.match_id}`">View</RouterLink>
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

    <p v-else-if="!error" class="muted">No matches synced yet.</p>
  </div>
</template>
