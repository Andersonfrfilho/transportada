/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useCallback, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'

import {
  parseTableViewPreferences,
  serializeTableViewPreferences,
} from '../shared/viewPreferences.serialization'
import type { ViewPreferencesClient } from '../shared/viewPreferencesClient.service'
import type {
  TableViewPreferences,
  TableViewPreferencesController,
} from './useNfeDocumentTable.hook'

const SAVE_DEBOUNCE_MS = 800
const CACHE_VERSION = 'v1'
const QUERY_KEY = 'view-preferences'

function cacheKey(viewKey: string): string {
  return `${QUERY_KEY}.${viewKey}.${CACHE_VERSION}`
}

function readCache(viewKey: string): TableViewPreferences {
  if (typeof window === 'undefined') return parseTableViewPreferences(undefined)
  try {
    const raw = window.localStorage.getItem(cacheKey(viewKey))
    return parseTableViewPreferences(raw === null ? undefined : JSON.parse(raw))
  } catch {
    return parseTableViewPreferences(undefined)
  }
}

function writeCache(viewKey: string, preferences: TableViewPreferences): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      cacheKey(viewKey),
      JSON.stringify(serializeTableViewPreferences(preferences)),
    )
  } catch {
    // Ignore storage failures (private mode / quota) — cache is best-effort.
  }
}

type UseTableViewPreferencesInput = Readonly<{
  client: ViewPreferencesClient
  enabled?: boolean
  viewKey: string
}>

export function useTableViewPreferences(
  input: UseTableViewPreferencesInput,
): TableViewPreferencesController {
  const { client, viewKey } = input
  const enabled = input.enabled ?? true
  const initial = useState<TableViewPreferences>(() => readCache(viewKey))[0]

  const query = useQuery({
    enabled,
    queryFn: () => client.get({ viewKey }),
    queryKey: [QUERY_KEY, viewKey],
    retry: false,
    staleTime: 30_000,
  })

  const { mutate } = useMutation({
    mutationFn: (preferences: TableViewPreferences) =>
      client.save({ preferences: serializeTableViewPreferences(preferences), viewKey }),
  })

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pendingRef = useRef<TableViewPreferences | undefined>(undefined)

  const onChange = useCallback(
    (preferences: TableViewPreferences) => {
      writeCache(viewKey, preferences)
      pendingRef.current = preferences
      if (timerRef.current !== undefined) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const next = pendingRef.current
        if (next !== undefined) mutate(next)
      }, SAVE_DEBOUNCE_MS)
    },
    [mutate, viewKey],
  )

  const remote = useMemo<TableViewPreferences | null>(() => {
    const record = query.data
    if (record === undefined || record === null) return null
    return parseTableViewPreferences(record.preferences)
  }, [query.data])

  return useMemo(() => ({ initial, onChange, remote }), [initial, onChange, remote])
}
