/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  parseTableViewPreferences,
  serializeTableViewPreferences,
} from '../shared/viewPreferences.serialization'
import type {
  ViewPreferencesClient,
  ViewPreferencesRecord,
} from '../shared/viewPreferencesClient.service'
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
  const queryClient = useQueryClient()

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

  /**
   * ⚠️ A aba de Notas desmonta inteira quando o operador troca de aba, e o que ela sabe dos filtros
   * morre junto. O que sobrevive é este cache — e ele precisa ser atualizado **na hora**, não só
   * quando o debounce vencer.
   *
   * São dois caches, e os dois enganavam na volta: o `localStorage`, que semeia a tabela, já era
   * escrito na hora; a consulta do react-query, que hidrata a tabela logo depois, ficava com a
   * resposta antiga por `staleTime` de 30s e sobrescrevia o filtro recém-editado com o de antes.
   * Por isso o `setQueryData` aqui: quem hidrata passa a ler o que o operador acabou de fazer.
   */
  const onChange = useCallback(
    (preferences: TableViewPreferences) => {
      writeCache(viewKey, preferences)
      queryClient.setQueryData<ViewPreferencesRecord>([QUERY_KEY, viewKey], {
        preferences: serializeTableViewPreferences(preferences),
        updatedAt: new Date().toISOString(),
      })
      pendingRef.current = preferences
      if (timerRef.current !== undefined) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const next = pendingRef.current
        if (next !== undefined) mutate(next)
      }, SAVE_DEBOUNCE_MS)
    },
    [mutate, queryClient, viewKey],
  )

  /**
   * Desmontar com o debounce pendente perdia a gravação: trocar de aba menos de 800ms depois de
   * mexer num filtro nunca chegava ao servidor. O `mutate` não serve na limpeza — o observador da
   * mutação morre com o componente —, então a gravação sai pelo cliente direto.
   */
  const clientRef = useRef(client)
  clientRef.current = client
  useEffect(
    () => () => {
      if (timerRef.current === undefined) return
      clearTimeout(timerRef.current)
      timerRef.current = undefined
      const next = pendingRef.current
      if (next === undefined) return
      void clientRef.current
        .save({ preferences: serializeTableViewPreferences(next), viewKey })
        .catch(() => undefined)
    },
    [viewKey],
  )

  const remote = useMemo<TableViewPreferences | null>(() => {
    const record = query.data
    if (record === undefined || record === null) return null
    return parseTableViewPreferences(record.preferences)
  }, [query.data])

  return useMemo(() => ({ initial, onChange, remote }), [initial, onChange, remote])
}
