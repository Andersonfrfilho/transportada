/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  withState,
  type AccessKeyLookupRow,
  type AccessKeyLookupRowState,
} from './accessKeyLookupRow.service'
import type { QueueScheduler } from './accessKeyLookupScheduler.service'

/**
 * O estado em memória da fila: as linhas, a geração que descarta respostas velhas e, por linha, o
 * relógio da busca (`startedAt`) e a contagem de falhas seguidas — ambos sobrevivem a stop/start.
 */
export type RowStore = Readonly<{
  failures: Map<string, number>
  get: (accessKey: string) => AccessKeyLookupRow | undefined
  getSnapshot: () => readonly AccessKeyLookupRow[]
  invalidateAll: () => void
  isActive: () => boolean
  isCurrent: (accessKey: string, generation: number) => boolean
  markRegistered: (accessKey: string, documentId: string) => void
  pollHandles: Map<string, unknown>
  publish: () => void
  generationOf: (accessKey: string) => number
  restart: (accessKey: string) => number
  rows: Map<string, AccessKeyLookupRow>
  setActive: (isActive: boolean) => void
  setState: (accessKey: string, state: AccessKeyLookupRowState, lookupId?: string) => void
  startedAt: Map<string, number>
  subscribe: (listener: () => void) => () => void
}>

export function createRowStore(scheduler: QueueScheduler): RowStore {
  const rows = new Map<string, AccessKeyLookupRow>()
  const generations = new Map<string, number>()
  const pollHandles = new Map<string, unknown>()
  const failures = new Map<string, number>()
  const startedAt = new Map<string, number>()
  const listeners = new Set<() => void>()
  let snapshot: readonly AccessKeyLookupRow[] = []
  let isActive = true

  function publish(): void {
    snapshot = [...rows.values()]
    listeners.forEach((listener) => listener())
  }

  function clearHandle(accessKey: string): void {
    const handle = pollHandles.get(accessKey)
    if (handle !== undefined) scheduler.clear(handle)
    pollHandles.delete(accessKey)
  }

  function bump(accessKey: string): number {
    const generation = (generations.get(accessKey) ?? 0) + 1
    generations.set(accessKey, generation)
    return generation
  }

  return {
    failures,
    get: (accessKey) => rows.get(accessKey),
    generationOf: (accessKey) => generations.get(accessKey) ?? 0,
    getSnapshot: () => snapshot,
    invalidateAll() {
      for (const accessKey of rows.keys()) {
        clearHandle(accessKey)
        bump(accessKey)
      }
      pollHandles.clear()
    },
    isActive: () => isActive,
    isCurrent: (accessKey, generation) => isActive && generations.get(accessKey) === generation,
    markRegistered(accessKey, documentId) {
      const row = rows.get(accessKey)
      if (row === undefined) return
      const wasRegistered = row.lookupId === null
      rows.set(accessKey, { ...withState(row, { documentId, kind: 'ready' }), wasRegistered })
      publish()
    },
    pollHandles,
    publish,
    restart(accessKey) {
      clearHandle(accessKey)
      failures.delete(accessKey)
      return bump(accessKey)
    },
    rows,
    setActive(next) {
      isActive = next
    },
    setState(accessKey, state, lookupId) {
      const row = rows.get(accessKey)
      if (row === undefined) return
      rows.set(accessKey, withState(row, state, lookupId ?? row.lookupId))
      publish()
    },
    startedAt,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
