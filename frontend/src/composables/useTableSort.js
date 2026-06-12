import { computed, ref } from 'vue'

function compareValues(a, b, type) {
  const aNull = a == null || a === ''
  const bNull = b == null || b === ''
  if (aNull && bNull) return 0
  if (aNull) return 1
  if (bNull) return -1

  if (type === 'number') {
    const na = Number(a)
    const nb = Number(b)
    if (na < nb) return -1
    if (na > nb) return 1
    return 0
  }

  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' })
}

export function useTableSort(itemsRef, columnDefs, defaultKey, defaultOrder = 'desc') {
  const sortKey = ref(defaultKey)
  const sortOrder = ref(defaultOrder)

  function toggleSort(key) {
    if (sortKey.value === key) {
      sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
      return
    }

    sortKey.value = key
    sortOrder.value = columnDefs[key]?.defaultOrder || 'asc'
  }

  function sortDirection(key) {
    if (sortKey.value !== key) return null
    return sortOrder.value
  }

  const sortedItems = computed(() => {
    const items = itemsRef.value
    const key = sortKey.value
    if (!items?.length || !key) return items

    const def = columnDefs[key]
    if (!def) return items

    const getter = def.get ?? ((row) => row[key])
    const type = def.type || 'string'
    const direction = sortOrder.value === 'asc' ? 1 : -1

    return [...items].sort((left, right) => {
      const cmp = compareValues(getter(left), getter(right), type)
      return cmp * direction
    })
  })

  return { sortKey, sortOrder, toggleSort, sortDirection, sortedItems }
}
