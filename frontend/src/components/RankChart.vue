<script setup>
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

const props = defineProps({
  points: { type: Array, default: () => [] },
})

const chartData = computed(() => {
  const labels = props.points.map((p) =>
    new Date(p.start_time * 1000).toLocaleDateString()
  )
  const mmr = props.points.map((p) => p.mmr_after ?? p.mmr_before)
  const colors = props.points.map((p) => {
    if (p.rank_up) return '#3fb950'
    if (p.rank_down) return '#f85149'
    if (p.is_calibration) return '#d29922'
    return '#58a6ff'
  })

  return {
    labels,
    datasets: [
      {
        label: 'MMR',
        data: mmr,
        borderColor: '#58a6ff',
        backgroundColor: 'rgba(88, 166, 255, 0.1)',
        fill: true,
        tension: 0.2,
        pointBackgroundColor: colors,
        pointRadius: props.points.map((p) => (p.is_calibration ? 8 : 5)),
      },
    ],
  }
})

const options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        afterLabel(ctx) {
          const p = props.points[ctx.dataIndex]
          const lines = []
          if (p.mmr_delta != null) lines.push(`Δ ${p.mmr_delta >= 0 ? '+' : ''}${p.mmr_delta}`)
          if (p.rank_up) lines.push('Rank up')
          else if (p.rank_down) lines.push('Rank down')
          if (p.is_calibration) lines.push('Calibration')
          if (p.medal_after) lines.push(p.medal_after)
          return lines
        },
      },
    },
  },
  scales: {
    y: { grid: { color: '#30363d' }, ticks: { color: '#8b949e' } },
    x: { grid: { display: false }, ticks: { color: '#8b949e', maxRotation: 45 } },
  },
}
</script>

<template>
  <div style="height: 280px">
    <Line v-if="points.length" :data="chartData" :options="options" />
    <p v-else class="muted">Add MMR on match diary entries to build your rank chart.</p>
  </div>
</template>
