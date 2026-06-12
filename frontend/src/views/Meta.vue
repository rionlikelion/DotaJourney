<script setup>
import { onMounted, ref, watch } from 'vue'
import SortableTh from '../components/SortableTh.vue'
import { HERO_STATS_COLUMNS } from '../composables/heroStatsColumns.js'
import { useTableSort } from '../composables/useTableSort.js'
import { api, ensureHeroMetadata, heroImageUrl } from '../api/client'

const heroes = ref([])
const error = ref(null)
const loading = ref(false)
const medalBracket = ref('')
const medalBrackets = ref([])
const medalBracketsInData = ref([])

const { toggleSort, sortDirection, sortedItems, sortKey } = useTableSort(
  heroes,
  HERO_STATS_COLUMNS,
  'games',
  'desc'
)

function heroRecord(h) {
  const losses = (h.games || 0) - (h.wins || 0)
  return `${h.wins || 0}–${losses}`
}

async function loadMeta() {
  loading.value = true
  error.value = null
  try {
    const params = medalBracket.value
      ? { medal_bracket: medalBracket.value }
      : {}
    const data = await api.meta(params)
    heroes.value = data.heroes
    medalBrackets.value = data.medal_brackets || []
    medalBracketsInData.value = data.medal_brackets_in_data || []
  } catch (e) {
    error.value = e.message
    heroes.value = []
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    await ensureHeroMetadata()
    await loadMeta()
  } catch (e) {
    error.value = e.message
  }
})

watch(medalBracket, () => {
  loadMeta()
})
</script>

<template>
  <div>
    <h2>Meta report</h2>
    <p class="muted">
      Heroes picked by other players in your matches (teammates and opponents).
      Games where you played that hero are excluded. Record and win rate are that
      player's results, not yours — see Heroes for your own picks.
    </p>

    <div class="filters">
      <label>
        Medal bracket
        <select v-model="medalBracket" :disabled="loading">
          <option value="">All brackets</option>
          <option v-for="b in medalBrackets" :key="b" :value="b">
            {{ b
            }}{{
              medalBracketsInData.length && !medalBracketsInData.includes(b)
                ? ' (no data)'
                : ''
            }}
          </option>
        </select>
      </label>
      <span v-if="loading" class="muted">Loading…</span>
      <span
        v-else-if="medalBracket && medalBracketsInData.length && !medalBracketsInData.includes(medalBracket)"
        class="muted"
      >
        No matches with medal before set to this bracket yet.
      </span>
      <span v-else-if="medalBracket" class="muted">
        Matches where your medal before was {{ medalBracket }} 1–5.
      </span>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <div v-if="heroes.length" class="table-scroll card">
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
            label="Record"
            column="wins"
            :active-column="sortKey"
            :direction="sortDirection('wins')"
            @sort="toggleSort"
          />
          <SortableTh
            label="Win rate"
            column="win_rate"
            :active-column="sortKey"
            :direction="sortDirection('win_rate')"
            @sort="toggleSort"
          />
          <SortableTh
            label="Avg K / D / A"
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
          <td>{{ heroRecord(h) }}</td>
          <td>{{ (h.win_rate * 100).toFixed(0) }}%</td>
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
    <p v-else-if="!error && !loading" class="muted">No meta hero data for this filter.</p>
  </div>
</template>
