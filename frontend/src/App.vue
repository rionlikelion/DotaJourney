<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const navOpen = ref(false)

watch(
  () => route.path,
  () => {
    navOpen.value = false
  }
)
</script>

<template>
  <div class="layout" :class="{ 'nav-open': navOpen }">
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
