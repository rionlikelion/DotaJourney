<script setup>
import { onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { api, ensureHeroMetadata, formatDate, heroImageUrl, roleLabel } from '../api/client'

const items = ref([])
const error = ref(null)
const rankUpOnly = ref(false)
const hasDiary = ref(false)
const hasClips = ref(false)
const page = ref(1)
const pageSize = 5
const hasNextPage = ref(false)

async function load() {
  error.value = null
  try {
    await ensureHeroMetadata()
    const params = {
      limit: pageSize,
      offset: (page.value - 1) * pageSize,
    }
    if (rankUpOnly.value) params.rank_up_only = true
    if (hasDiary.value) params.has_diary = true
    if (hasClips.value) params.has_clips = true
    const data = await api.journey(params)
    items.value = data.items
    hasNextPage.value = data.items.length === pageSize
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

watch([rankUpOnly, hasDiary, hasClips], () => {
  page.value = 1
  load()
})
onMounted(load)
</script>

<template>
  <div>
    <h2>Journey</h2>
    <p class="muted">Your climb diary — newest first.</p>

    <div class="filters">
      <label><input v-model="rankUpOnly" type="checkbox" /> Rank-ups only</label>
      <label><input v-model="hasDiary" type="checkbox" /> Has diary</label>
      <label><input v-model="hasClips" type="checkbox" /> Has clips</label>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="!items.length && !error" class="card muted">
      No matches yet. Run sync from the Dashboard after setting up config.json.
    </div>

    <article
      v-for="item in items"
      :key="item.match_id"
      class="timeline-item card"
      :class="{ 'rank-up': item.rank_up, milestone: item.is_milestone }"
    >
      <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center">
        <span :class="['badge', item.won ? 'win' : 'loss']">
          {{ item.won ? 'Win' : 'Loss' }}
        </span>
        <span v-if="item.is_calibration" class="badge calibration">Calibration</span>
        <span v-if="item.is_milestone" class="badge milestone">Milestone</span>
        <span v-if="item.has_clips" class="badge clip">Clips</span>
        <span v-if="item.rank_up" class="badge milestone">Rank up</span>
        <span class="muted">{{ formatDate(item.start_time) }}</span>
      </div>

      <h3 style="margin: 0.5rem 0">
        <span class="hero-cell">
          <img
            v-if="item.my_hero_id || item.my_hero_name"
            :src="heroImageUrl(item.my_hero_id || item.my_hero_name)"
            :alt="item.my_hero_name || item.my_hero_id"
            class="hero-icon"
          />
          <RouterLink :to="`/matches/${item.match_id}`">
            {{ item.my_hero_name || item.my_hero_id || 'Unknown hero' }}
          </RouterLink>
        </span>
        · {{ item.my_kills }}/{{ item.my_deaths }}/{{ item.my_assists }}
        <span v-if="item.role_played"> · {{ roleLabel(item.role_played) }}</span>
      </h3>

      <p v-if="item.mmr_delta != null || item.medal_after" class="muted">
        <span v-if="item.mmr_before != null && item.mmr_after != null">
          MMR {{ item.mmr_before }} → {{ item.mmr_after }}
          <span v-if="item.mmr_delta != null">
            ({{ item.mmr_delta >= 0 ? '+' : '' }}{{ item.mmr_delta }})
          </span>
        </span>
        <span v-if="item.medal_before || item.medal_after">
          · {{ item.medal_before || '?' }} → {{ item.medal_after || '?' }}
        </span>
      </p>

      <p v-if="item.diary_entry" style="white-space: pre-wrap">{{ item.diary_entry }}</p>
      <p v-else class="muted">No diary entry — open match to document this game.</p>
    </article>

    <div class="pagination">
      <button class="btn" :disabled="page === 1" @click="goToPreviousPage">
        Previous
      </button>
      <span class="muted">Page {{ page }}</span>
      <button class="btn" :disabled="!hasNextPage" @click="goToNextPage">
        Next
      </button>
    </div>
  </div>
</template>
