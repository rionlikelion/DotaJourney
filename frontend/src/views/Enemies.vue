<script setup>
import { onMounted, ref } from 'vue'
import SortableTh from '../components/SortableTh.vue'
import { HERO_STATS_COLUMNS } from '../composables/heroStatsColumns.js'
import { useTableSort } from '../composables/useTableSort.js'
import { api, ensureHeroMetadata, heroImageUrl } from '../api/client'

const heroes = ref([])
const error = ref(null)
const loading = ref(false)

const { toggleSort, sortDirection, sortedItems, sortKey } = useTableSort(
  heroes,
  HERO_STATS_COLUMNS,
  'games',
  'desc'
)

onMounted(async () => {
  loading.value = true
  error.value = null
  try {
    await ensureHeroMetadata()
    const data = await api.enemies()
    heroes.value = data.heroes
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <h2>Enemies report</h2>
    <p class="muted">Heroes you've faced on the opposing team.</p>
    <p v-if="error" class="error">{{ error }}</p>
    <div v-if="loading && !heroes.length" class="table-scroll card">
      <p class="muted">Loading…</p>
    </div>
    <div v-else-if="heroes.length" class="table-scroll card">
      <table>
      <thead>
        <tr>
          <SortableTh
            label="Hero"
            column="hero_name"
            :active-column="sortKey"
            :direction="sortDirection('hero_name')"
            @sort="toggleSort"
          />
          <SortableTh
            label="Games"
            column="games"
            :active-column="sortKey"
            :direction="sortDirection('games')"
            @sort="toggleSort"
          />
          <SortableTh
            label="Your win rate"
            column="win_rate"
            :active-column="sortKey"
            :direction="sortDirection('win_rate')"
            @sort="toggleSort"
          />
          <SortableTh
            label="Their avg K / D / A"
            column="avg_kills"
            :active-column="sortKey"
            :direction="sortDirection('avg_kills')"
            @sort="toggleSort"
          />
        </tr>
      </thead>
      <tbody>
        <tr v-for="h in sortedItems" :key="h.hero_name">
          <td>
            <span class="hero-cell">
              <img
                v-if="h.hero_name"
                :src="heroImageUrl(h.hero_name)"
                :alt="h.hero_name"
                :title="h.hero_name"
                class="hero-icon"
              />
              <span class="hero-name">{{ h.hero_name }}</span>
            </span>
          </td>
          <td>{{ h.games }}</td>
          <td
            :class="{
              'value-success': h.win_rate * 100 >= 50,
              'value-danger': h.win_rate * 100 < 50,
            }"
          >
            {{ (h.win_rate * 100).toFixed(0) }}%
          </td>
          <td>
            <span class="value-success">{{ h.avg_kills }}</span>
            <span class="muted">/</span>
            <span class="value-danger">{{ h.avg_deaths }}</span>
            <span class="muted">/</span>
            <span class="value-muted">{{ h.avg_assists }}</span>
          </td>
        </tr>
      </tbody>
      </table>
    </div>
    <p v-else-if="!error" class="muted">No enemy hero data yet.</p>
  </div>
</template>
