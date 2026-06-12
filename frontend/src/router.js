import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from './views/Dashboard.vue'
import Matches from './views/Matches.vue'
import MatchDetail from './views/MatchDetail.vue'
import Heroes from './views/Heroes.vue'
import Friends from './views/Friends.vue'
import Enemies from './views/Enemies.vue'
import Meta from './views/Meta.vue'
import Roles from './views/Roles.vue'

const routes = [
  { path: '/', name: 'dashboard', component: Dashboard },
  { path: '/matches', name: 'matches', component: Matches },
  { path: '/matches/:id', name: 'match', component: MatchDetail },
  { path: '/heroes', name: 'heroes', component: Heroes },
  { path: '/friends', name: 'friends', component: Friends },
  { path: '/enemies', name: 'enemies', component: Enemies },
  { path: '/meta', name: 'meta', component: Meta },
  { path: '/roles', name: 'roles', component: Roles },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})
