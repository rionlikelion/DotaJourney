<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  api,
  ensureHeroMetadata,
  formatDate,
  formatDuration,
  heroImageUrl,
  ROLES,
  roleLabel,
} from '../api/client'

const route = useRoute()
const data = ref(null)
const error = ref(null)
const saving = ref(false)
const saved = ref(false)

const myHeroId = computed(() => {
  const match = data.value?.match
  const player = data.value?.players?.find((p) => p.is_me)
  return player?.hero_id ?? match?.my_hero_id
})

const form = ref({
  diary_entry: '',
  mmr_before: null,
  mmr_after: null,
  medal_before: '',
  medal_after: '',
  is_calibration: false,
  role_played: '',
  is_milestone: false,
  tags: '',
})
const mmrDeltaInput = ref('')
const isEditingMmrDelta = ref(false)

const MEDALS = [
  'Herald 1','Herald 2','Herald 3','Herald 4','Herald 5',
  'Guardian 1','Guardian 2','Guardian 3','Guardian 4','Guardian 5',
  'Crusader 1','Crusader 2','Crusader 3','Crusader 4','Crusader 5',
  'Archon 1','Archon 2','Archon 3','Archon 4','Archon 5',
  'Legend 1','Legend 2','Legend 3','Legend 4','Legend 5'
]
const mmrDelta = computed(() => {
  const b = form.value.mmr_before
  const a = form.value.mmr_after
  if (b == null || a == null || b === '' || a === '') return null
  return Number(a) - Number(b)
})

function syncMmrDeltaInput() {
  if (form.value.mmr_before == null || form.value.mmr_before === '' || form.value.mmr_after == null || form.value.mmr_after === '') {
    mmrDeltaInput.value = ''
    return
  }

  const delta = Number(form.value.mmr_after) - Number(form.value.mmr_before)
  mmrDeltaInput.value = Number.isFinite(delta) ? String(delta) : ''
}

function handleMmrDeltaInput(event) {
  const rawValue = event.target.value
  isEditingMmrDelta.value = true

  if (rawValue === '' || rawValue === '-' || rawValue === '+') {
    return
  }

  const delta = Number(rawValue)
  if (!Number.isFinite(delta) || !Number.isInteger(delta)) {
    return
  }

  if (form.value.mmr_before == null || form.value.mmr_before === '') {
    return
  }

  form.value.mmr_after = Number(form.value.mmr_before) + delta
}

function handleMmrDeltaBlur() {
  isEditingMmrDelta.value = false
  syncMmrDeltaInput()
}

watch(
  [() => form.value.mmr_before, () => form.value.mmr_after],
  () => {
    if (isEditingMmrDelta.value) return
    syncMmrDeltaInput()
  },
  { immediate: true }
)

watch(mmrDelta, (d) => {
  if (d === 0 && form.value.mmr_before != null && form.value.mmr_after != null) {
    form.value.is_calibration = true
  }
})

async function load() {
  error.value = null
  saved.value = false
  try {
    await ensureHeroMetadata()
    data.value = await api.match(route.params.id)
    const a = data.value.annotation || {}
    form.value = {
      diary_entry: a.diary_entry || '',
      mmr_before: a.mmr_before ?? null,
      mmr_after: a.mmr_after ?? null,
      medal_before: a.medal_before || '',
      medal_after: a.medal_after || '',
      is_calibration: !!a.is_calibration,
      role_played: a.role_played || data.value.match.my_role || '',
      is_milestone: !!a.is_milestone,
      tags: a.tags || '',
    }
  } catch (e) {
    error.value = e.message
  }
}

async function save() {
  saving.value = true
  error.value = null
  saved.value = false
  try {
    const body = {
      diary_entry: form.value.diary_entry || null,
      mmr_before:
        form.value.mmr_before === '' || form.value.mmr_before == null
          ? null
          : Number(form.value.mmr_before),
      mmr_after:
        form.value.mmr_after === '' || form.value.mmr_after == null
          ? null
          : Number(form.value.mmr_after),
      medal_before: form.value.medal_before || null,
      medal_after: form.value.medal_after || null,
      is_calibration: form.value.is_calibration,
      role_played: form.value.role_played || null,
      is_milestone: form.value.is_milestone,
      tags: form.value.tags || null,
    }
    await api.saveAnnotation(route.params.id, body)
    saved.value = true
    await load()
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}

watch(() => route.params.id, load)
onMounted(load)
</script>

<template>
  <div v-if="data">
    <p><router-link to="/matches">← Matches</router-link></p>

    <h2 class="match-header">
      <span class="hero-cell">
        <img
          v-if="myHeroId || data.match.my_hero_name"
          :src="heroImageUrl(myHeroId || data.match.my_hero_name)"
          :alt="data.match.my_hero_name || myHeroId"
          class="hero-icon"
        />
        {{ data.match.my_hero_name || myHeroId || 'Match' }}
      </span>
      <span :class="['badge', data.match.won ? 'win' : 'loss']">
        {{ data.match.won ? 'Win' : 'Loss' }}
      </span>
    </h2>

    <p class="muted">
      {{ formatDate(data.match.start_time) }} · {{ formatDuration(data.match.duration) }}
      · {{ data.match.game_mode_name || 'Unknown mode' }}
      · Match {{ data.match.match_id }}
    </p>

    <div class="card row">
      <div class="stat">
        <div class="value">
          <span class="value-success">{{ data.match.my_kills }}</span>
          <span class="muted">/</span>
          <span class="value-danger">{{ data.match.my_deaths }}</span>
          <span class="muted">/</span>
          <span class="value-muted">{{ data.match.my_assists }}</span>
        </div>
        <div class="label">KDA</div>
      </div>
      <div class="stat" v-if="data.players.find((p) => p.is_me)">
        <div class="value">{{ data.players.find((p) => p.is_me).gold_per_min }}</div>
        <div class="label">GPM</div>
      </div>
      <div class="stat" v-if="data.players.find((p) => p.is_me)">
        <div class="value">{{ data.players.find((p) => p.is_me).xp_per_min }}</div>
        <div class="label">XPM</div>
      </div>
    </div>

    <div v-if="data.clips.length" class="card">
      <h3 style="margin-top: 0">Clips</h3>
      <p class="muted">Files in clips/{{ data.match.match_id }}/</p>
      <div v-for="clip in data.clips" :key="clip.filename">
        <p><strong>{{ clip.filename }}</strong></p>
        <video controls :src="clip.url" />
      </div>
    </div>
    <div v-else class="card muted">
      No clips. Add videos to <code>clips/{{ data.match.match_id }}/</code>
    </div>

    <div class="card">
      <h3 style="margin-top: 0">Diary &amp; rank</h3>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="saved" style="color: var(--win)">Saved.</p>

      <div class="form-group">
        <label>Diary entry</label>
        <textarea v-model="form.diary_entry" placeholder="What happened? What did you learn?" />
      </div>

      <p
        v-if="data.players.find((p) => p.is_me)?.parsed_role && !form.role_played"
        class="muted"
      >
        OpenDota detected role:
        {{ roleLabel(data.players.find((p) => p.is_me).parsed_role) }} — save to confirm.
      </p>
      <div class="row">
        <div class="form-group">
          <label>Role played</label>
          <select v-model="form.role_played">
            <option value="">— Select —</option>
            <option v-for="r in ROLES" :key="r.value" :value="r.value">
              {{ r.label }}
            </option>
          </select>
        </div>
      </div>

      <div class="row">
        <div class="form-group">
          <label>MMR before</label>
          <input v-model.number="form.mmr_before" type="number" />
        </div>
        <div class="form-group">
          <label>MMR after</label>
          <input v-model.number="form.mmr_after" type="number" />
        </div>
        <div class="form-group">
          <label>MMR change</label>
          <input
            v-model="mmrDeltaInput"
            type="number"
            step="1"
            inputmode="numeric"
            @input="handleMmrDeltaInput"
            @blur="handleMmrDeltaBlur"
          />
        </div>
      </div>

      <div class="row">
        <div class="form-group">
          <label>Medal before</label>
          <select v-model="form.medal_before">
            <option value="">— Select —</option>
            <option v-for="m in MEDALS" :key="m" :value="m">{{ m }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>Medal after</label>
          <select v-model="form.medal_after">
            <option value="">— Select —</option>
            <option v-for="m in MEDALS" :key="m" :value="m">{{ m }}</option>
          </select>
        </div>
      </div>

      <div class="checkbox-row">
        <label>
          <input v-model="form.is_calibration" type="checkbox" />
          Calibration game (0 MMR change)
        </label>
        <label>
          <input v-model="form.is_milestone" type="checkbox" />
          Milestone
        </label>
      </div>

      <div class="form-group">
        <label>Tags (comma-separated)</label>
        <input v-model="form.tags" placeholder="rank-up, learned, tilt" />
      </div>

      <button class="btn primary" :disabled="saving" @click="save">
        {{ saving ? 'Saving…' : 'Save diary' }}
      </button>
    </div>

    <div class="card">
      <h3 style="margin-top: 0">All players</h3>
      <table>
        <thead>
          <tr>
            <th>Hero</th>
            <th>KDA</th>
            <th>GPM</th>
            <th>XPM</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="p in data.players"
            :key="p.player_slot"
            :style="p.is_me ? { fontWeight: 600 } : {}"
          >
            <td>
              <span class="hero-cell">
                <img
                  v-if="p.hero_name"
                  :src="heroImageUrl(p.hero_name)"
                  :alt="p.hero_name"
                  class="hero-icon"
                />
                {{ p.hero_name }}{{ p.is_me ? ' (you)' : '' }}
              </span>
            </td>
            <td>
              <span class="value-success">{{ p.kills }}</span>
              <span class="muted">/</span>
              <span class="value-danger">{{ p.deaths }}</span>
              <span class="muted">/</span>
              <span class="value-muted">{{ p.assists }}</span>
            </td>
            <td>{{ p.gold_per_min }}</td>
            <td>{{ p.xp_per_min }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  <p v-else-if="error" class="error">{{ error }}</p>
  <p v-else class="muted">Loading…</p>
</template>
