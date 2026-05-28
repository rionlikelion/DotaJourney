<script setup>
import { onMounted, ref } from 'vue'
import { api, roleLabel } from '../api/client'

const roles = ref([])
const error = ref(null)

onMounted(async () => {
  try {
    const data = await api.roles()
    roles.value = data.roles
  } catch (e) {
    error.value = e.message
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
    <table v-if="roles.length" class="card">
      <thead>
        <tr>
          <th>Role</th>
          <th>Games</th>
          <th>Win rate</th>
          <th>Avg KDA</th>
          <th>Avg MMR Δ</th>
          <th>Calibration games</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in roles" :key="r.role_played">
          <td>
            <strong>{{
              r.role_played === 'unassigned' ? 'Unassigned' : roleLabel(r.role_played)
            }}</strong>
          </td>
          <td>{{ r.games }}</td>
          <td>{{ (r.win_rate * 100).toFixed(0) }}%</td>
          <td>{{ r.avg_kills }}/{{ r.avg_deaths }}/{{ r.avg_assists }}</td>
          <td>{{ r.avg_mmr_delta ?? '—' }}</td>
          <td>{{ r.calibration_games }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="!error" class="muted">No role data yet.</p>
  </div>
</template>
