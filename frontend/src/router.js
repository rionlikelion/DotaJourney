import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from './views/Dashboard.vue'
import Journey from './views/Journey.vue'
import Matches from './views/Matches.vue'
import MatchDetail from './views/MatchDetail.vue'
import Heroes from './views/Heroes.vue'
import Roles from './views/Roles.vue'

const routes = [
  { path: '/', name: 'dashboard', component: Dashboard },
  { path: '/journey', name: 'journey', component: Journey },
  { path: '/matches', name: 'matches', component: Matches },
  { path: '/matches/:id', name: 'match', component: MatchDetail },
  { path: '/heroes', name: 'heroes', component: Heroes },
  { path: '/roles', name: 'roles', component: Roles },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})
