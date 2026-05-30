<script setup>
import { onMounted, ref } from 'vue'
import { api, ensureHeroMetadata, heroImageUrl } from '../api/client'

const heroes = ref([])
const error = ref(null)

onMounted(async () => {
  try {
    await ensureHeroMetadata()
    const data = await api.heroes()
    heroes.value = data.heroes
  } catch (e) {
    error.value = e.message
  }
})
</script>

<template>
  <div>
    <h2>Heroes report</h2>
    <p v-if="error" class="error">{{ error }}</p>
    <table v-if="heroes.length" class="card">
      <thead>
        <tr>
          <th>Hero</th>
          <th>Games</th>
          <th>Win rate</th>
          <th>Avg K / D / A</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="h in heroes" :key="h.hero_name">
          <td>
            <span class="hero-cell">
              <img
                v-if="h.hero_name"
                :src="heroImageUrl(h.hero_name)"
                :alt="h.hero_name"
                class="hero-icon"
              />
              <span>{{ h.hero_name }}</span>
            </span>
          </td>
          <td>{{ h.games }}</td>
          <td
            :class="{
              'value-success': (h.win_rate * 100) >= 50,
              'value-danger': (h.win_rate * 100) < 50,
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
    <p v-else-if="!error" class="muted">No hero data yet.</p>
  </div>
</template>
