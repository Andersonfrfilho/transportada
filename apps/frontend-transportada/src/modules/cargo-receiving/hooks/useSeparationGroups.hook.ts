/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo, useState } from 'react'

import type { CargoArrivalGroup } from '../shared/cargoArrival.types'
import {
  filterGroupsByNumber,
  resolveGroupKey,
  resolveOpenGroupKeys,
  type GroupToggles,
} from '../shared/cargoArrivalGroups.service'

export type SeparationGroupsController = Readonly<{
  isSearching: boolean
  openGroupKeys: ReadonlySet<string>
  query: string
  setQuery: (query: string) => void
  toggleGroup: (group: CargoArrivalGroup) => void
  visibleGroups: readonly CargoArrivalGroup[]
}>

/** Quais grupos aparecem e quais estão abertos; com busca, os grupos que casam abrem todos. */
export function useSeparationGroups(
  groups: readonly CargoArrivalGroup[],
): SeparationGroupsController {
  const [toggled, setToggled] = useState<GroupToggles>({})
  const [query, setQuery] = useState('')
  const isSearching = query.trim() !== ''
  const visibleGroups = useMemo(() => filterGroupsByNumber({ groups, query }), [groups, query])
  const openGroupKeys = isSearching
    ? new Set(visibleGroups.map(resolveGroupKey))
    : resolveOpenGroupKeys({ groups, toggled })

  return {
    isSearching,
    openGroupKeys,
    query,
    setQuery,
    toggleGroup: (group) => {
      const key = resolveGroupKey(group)
      setToggled((current) => ({ ...current, [key]: !openGroupKeys.has(key) }))
    },
    visibleGroups,
  }
}
