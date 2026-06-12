<script setup>
defineProps({
  label: { type: String, required: true },
  column: { type: String, required: true },
  activeColumn: { type: String, default: null },
  direction: { type: String, default: null },
})

defineEmits(['sort'])
</script>

<template>
  <th
    class="sortable-th"
    :class="{ active: activeColumn === column }"
    :aria-sort="activeColumn === column ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'"
    @click="$emit('sort', column)"
  >
    <span class="sortable-th-label">{{ label }}</span>
    <span class="sort-indicator" aria-hidden="true">
      <template v-if="activeColumn === column">{{ direction === 'asc' ? '↑' : '↓' }}</template>
      <template v-else>↕</template>
    </span>
  </th>
</template>
