<template>
  <div class="layout">
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
      <p class="muted" style="margin-top: 2rem; font-size: 0.75rem">
        Climb to Legend — diary &amp; evidence
      </p>
    </nav>
    <main>
      <router-view />
    </main>
  </div>
</template>
