<script setup>
import { ref, watch, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const navOpen = ref(false)
const isAuthenticated = ref(false)
const password = ref('')
const errorMessage = ref('')
const isLoading = ref(false)

onMounted(() => {
  const stored = sessionStorage.getItem('app-authenticated')
  if (stored === 'true') {
    isAuthenticated.value = true
  }
})

const handlePasswordSubmit = async () => {
  if (!password.value.trim()) {
    errorMessage.value = 'Please enter a password'
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    const response = await fetch('/api/verify-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: password.value }),
    })

    if (response.ok) {
      isAuthenticated.value = true
      sessionStorage.setItem('app-authenticated', 'true')
      password.value = ''
    } else {
      errorMessage.value = 'Invalid password'
      password.value = ''
    }
  } catch (err) {
    errorMessage.value = 'Error verifying password'
    console.error(err)
  } finally {
    isLoading.value = false
  }
}

watch(
  () => route.path,
  () => {
    navOpen.value = false
  }
)
</script>

<template>
  <!-- Password Prompt - Black background -->
  <div v-if="!isAuthenticated" class="password-overlay">
    <div class="password-prompt">
      <h1>Access Required</h1>
      <form @submit.prevent="handlePasswordSubmit">
        <input
          v-model="password"
          type="password"
          placeholder="Enter password"
          :disabled="isLoading"
          autofocus
        />
        <button type="submit" :disabled="isLoading">
          {{ isLoading ? 'Verifying...' : 'Enter' }}
        </button>
      </form>
      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
    </div>
  </div>

  <!-- Main App - Only visible after authentication -->
  <div v-if="isAuthenticated" class="layout" :class="{ 'nav-open': navOpen }">
    <header class="mobile-header">
      <button
        type="button"
        class="nav-toggle"
        :aria-expanded="navOpen"
        aria-label="Toggle navigation"
        @click="navOpen = !navOpen"
      >
        <span class="nav-toggle-bar" />
        <span class="nav-toggle-bar" />
        <span class="nav-toggle-bar" />
      </button>
      <span class="mobile-header-title">Rion Dota Journey</span>
    </header>

    <div
      v-if="navOpen"
      class="nav-overlay"
      aria-hidden="true"
      @click="navOpen = false"
    />

    <nav>
      <h1>Rion Dota Journey</h1>
      <ul>
        <li><router-link to="/">Dashboard</router-link></li>
        <li><router-link to="/matches">Matches</router-link></li>
        <li><router-link to="/heroes">Heroes</router-link></li>
        <li><router-link to="/friends">Friends</router-link></li>
        <li><router-link to="/enemies">Enemies</router-link></li>
        <li><router-link to="/meta">Meta</router-link></li>
        <li><router-link to="/roles">Roles</router-link></li>
      </ul>
      <p class="nav-tagline muted">
        Climb to Legend — diary &amp; evidence
      </p>
    </nav>

    <main>
      <router-view />
    </main>
  </div>
</template>
