<script setup>
import { onMounted, ref } from 'vue'
import SortableTh from '../components/SortableTh.vue'
import { useTableSort } from '../composables/useTableSort.js'
import { api, roleLabel } from '../api/client'

const roles = ref([])
const error = ref(null)
const loading = ref(false)

const ROLE_COLUMNS = {
  role_played: {
    type: 'string',
    defaultOrder: 'asc',
    get: (row) => (row.role_played === 'unassigned' ? 'zzzz' : row.role_played),
  },
  games: { type: 'number', defaultOrder: 'desc' },
  win_rate: { type: 'number', defaultOrder: 'desc' },
  avg_kills: { type: 'number', defaultOrder: 'desc' },
  avg_mmr_delta: { type: 'number', defaultOrder: 'desc' },
  calibration_games: { type: 'number', defaultOrder: 'desc' },
}

const { toggleSort, sortDirection, sortedItems, sortKey } = useTableSort(
  roles,
  ROLE_COLUMNS,
  'games',
  'desc'
)

onMounted(async () => {
  loading.value = true
  error.value = null
  try {
    const data = await api.roles()
    roles.value = data.roles
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <h2>Roles report</h2>
    <p class="muted">
      Roles are set manually on each match diary. Assign roles for accurate reports.
    </p>
    <p v-if="error" class="error">{{ error }}</p>
    <div v-if="loading && !roles.length" class="table-scroll table-scroll--wide card">
      <p class="muted">Loading…</p>
    </div>
    <div v-else-if="roles.length" class="table-scroll table-scroll--wide card">
      <table>
      <thead>
        <tr>
          <SortableTh
            label="Role"
            column="role_played"
            :active-column="sortKey"
            :direction="sortDirection('role_played')"
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
            label="Win rate"
            column="win_rate"
            :active-column="sortKey"
            :direction="sortDirection('win_rate')"
            @sort="toggleSort"
          />
          <SortableTh
            label="Avg KDA"
            column="avg_kills"
            :active-column="sortKey"
            :direction="sortDirection('avg_kills')"
            @sort="toggleSort"
          />
          <SortableTh
            label="Avg MMR Δ"
            column="avg_mmr_delta"
            :active-column="sortKey"
            :direction="sortDirection('avg_mmr_delta')"
            @sort="toggleSort"
          />
          <SortableTh
            label="Calibration games"
            column="calibration_games"
            :active-column="sortKey"
            :direction="sortDirection('calibration_games')"
            @sort="toggleSort"
          />
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in sortedItems" :key="r.role_played">
          <td>
            <strong>{{
              r.role_played === 'unassigned' ? 'Unassigned' : roleLabel(r.role_played)
            }}</strong>
          </td>
          <td>{{ r.games }}</td>
          <td
            :class="{
              'value-success': (r.win_rate * 100) >= 50,
              'value-danger': (r.win_rate * 100) < 50,
            }"
          >
            {{ (r.win_rate * 100).toFixed(0) }}%
          </td>
          <td>
            <span class="value-success">{{ r.avg_kills }}</span>
            <span class="muted">/</span>
            <span class="value-danger">{{ r.avg_deaths }}</span>
            <span class="muted">/</span>
            <span class="value-muted">{{ r.avg_assists }}</span>
          </td>
          <td
            :class="{
              'value-success': r.avg_mmr_delta > 0,
              'value-danger': r.avg_mmr_delta < 0,
            }"
          >
            {{ r.avg_mmr_delta ?? '—' }}
          </td>
          <td>{{ r.calibration_games }}</td>
        </tr>
      </tbody>
      </table>
    </div>
    <p v-else-if="!error" class="muted">No role data yet.</p>
  </div>
</template>
