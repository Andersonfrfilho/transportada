/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  CHECK_BATCH_MAX_KEYS,
  CHECK_BATCH_WINDOW_MS,
  LOOKUP_POLL_INTERVAL_MS,
  LOOKUP_POLL_MAX_DURATION_MS,
  REQUEST_FAILED_CODE,
} from './accessKeyLookup.constant'
import {
  AccessKeyLookupRequestError,
  type AccessKeyLookupClient,
} from './accessKeyLookupClient.service'
import {
  createCheckingRow,
  deriveRowFlags,
  stateFromLookupView,
  stateFromRequestResult,
  withState,
  type AccessKeyLookupRow,
  type AccessKeyLookupRowState,
} from './accessKeyLookupRow.service'

export type QueueScheduler = Readonly<{
  clear: (handle: unknown) => void
  now: () => number
  schedule: (task: () => void, delayMs: number) => unknown
}>

export const BROWSER_SCHEDULER: QueueScheduler = {
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
  schedule: (task, delayMs) => setTimeout(task, delayMs),
}

export type AddAccessKeyResult = Readonly<{ alreadyScanned: boolean }>

export type AccessKeyLookupQueue = Readonly<{
  add: (accessKey: string) => AddAccessKeyResult
  getRows: () => readonly AccessKeyLookupRow[]
  /** Depois do envio do XML: confere o cadastro da chave e vira "pronta" se a nota já entrou. */
  recheck: (accessKey: string) => Promise<boolean>
  markXmlImported: (accessKey: string, documentId: string) => void
  retry: (accessKey: string) => void
  /** Retoma o que ficou pendente quando a tela volta; sem efeito se a fila já está ativa. */
  start: () => void
  /** A tela fechou: cancela relógios e descarta respostas em voo, mantendo as linhas. */
  stop: () => void
  subscribe: (listener: () => void) => () => void
}>

export type AccessKeyLookupQueueOptions = Readonly<{
  client: AccessKeyLookupClient
  scheduler?: QueueScheduler
}>

function errorState(error: unknown): AccessKeyLookupRowState {
  const code = error instanceof AccessKeyLookupRequestError ? error.code : REQUEST_FAILED_CODE
  return { code, kind: 'error' }
}

export function createAccessKeyLookupQueue(
  options: AccessKeyLookupQueueOptions,
): AccessKeyLookupQueue {
  const { client } = options
  const scheduler = options.scheduler ?? BROWSER_SCHEDULER
  const rows = new Map<string, AccessKeyLookupRow>()
  const generations = new Map<string, number>()
  const pollHandles = new Map<string, unknown>()
  const listeners = new Set<() => void>()
  let snapshot: readonly AccessKeyLookupRow[] = []
  let pendingBatch: string[] = []
  let batchHandle: unknown
  let isActive = true

  function publish(): void {
    snapshot = [...rows.values()]
    listeners.forEach((listener) => listener())
  }

  function setState(accessKey: string, state: AccessKeyLookupRowState, lookupId?: string): void {
    const row = rows.get(accessKey)
    if (row === undefined) return
    rows.set(accessKey, withState(row, state, lookupId ?? row.lookupId))
    publish()
  }

  function restart(accessKey: string): number {
    const handle = pollHandles.get(accessKey)
    if (handle !== undefined) scheduler.clear(handle)
    pollHandles.delete(accessKey)
    const generation = (generations.get(accessKey) ?? 0) + 1
    generations.set(accessKey, generation)
    return generation
  }

  function isCurrent(accessKey: string, generation: number): boolean {
    return isActive && generations.get(accessKey) === generation
  }

  function schedulePoll(accessKey: string, generation: number, startedAt: number): void {
    pollHandles.set(
      accessKey,
      scheduler.schedule(() => {
        void poll(accessKey, generation, startedAt)
      }, LOOKUP_POLL_INTERVAL_MS),
    )
  }

  async function poll(accessKey: string, generation: number, startedAt: number): Promise<void> {
    const lookupId = rows.get(accessKey)?.lookupId
    if (lookupId === null || lookupId === undefined) return
    let state: AccessKeyLookupRowState
    try {
      state = stateFromLookupView(await client.getLookup(lookupId))
    } catch (error) {
      if (isCurrent(accessKey, generation)) setState(accessKey, errorState(error))
      return
    }
    if (!isCurrent(accessKey, generation)) return
    if (deriveRowFlags(state).isTerminal || state.kind === 'error') {
      setState(accessKey, state)
      return
    }
    if (scheduler.now() - startedAt >= LOOKUP_POLL_MAX_DURATION_MS) {
      setState(accessKey, { kind: 'stalled' })
      return
    }
    setState(accessKey, state)
    schedulePoll(accessKey, generation, startedAt)
  }

  async function startLookup(accessKey: string, generation: number): Promise<void> {
    let state: AccessKeyLookupRowState
    let lookupId: null | string = null
    try {
      const result = await client.requestLookup(accessKey)
      state = stateFromRequestResult(result)
      if (result.kind === 'lookup') lookupId = result.lookup.id
    } catch (error) {
      if (isCurrent(accessKey, generation)) setState(accessKey, errorState(error))
      return
    }
    if (!isCurrent(accessKey, generation)) return
    setState(accessKey, state, lookupId ?? undefined)
    if (state.kind === 'searching' || state.kind === 'waiting') {
      schedulePoll(accessKey, generation, scheduler.now())
    }
  }

  async function flushBatch(): Promise<void> {
    const accessKeys = pendingBatch
    pendingBatch = []
    if (batchHandle !== undefined) scheduler.clear(batchHandle)
    batchHandle = undefined
    if (accessKeys.length === 0) return
    const generationsAtSend = new Map(accessKeys.map((key) => [key, generations.get(key) ?? 0]))
    let entries: Awaited<ReturnType<AccessKeyLookupClient['checkAccessKeys']>>
    try {
      entries = await client.checkAccessKeys(accessKeys)
    } catch (error) {
      for (const key of accessKeys) {
        if (isCurrent(key, generationsAtSend.get(key) ?? 0)) setState(key, errorState(error))
      }
      return
    }
    const documentIds = new Map(entries.map((entry) => [entry.accessKey, entry.documentId]))
    for (const key of accessKeys) {
      const generation = generationsAtSend.get(key) ?? 0
      if (!isCurrent(key, generation)) continue
      const documentId = documentIds.get(key) ?? null
      if (documentId !== null) setState(key, { documentId, kind: 'ready' })
      else void startLookup(key, generation)
    }
  }

  function enqueueCheck(accessKey: string): void {
    pendingBatch.push(accessKey)
    if (pendingBatch.length >= CHECK_BATCH_MAX_KEYS) {
      void flushBatch()
      return
    }
    batchHandle ??= scheduler.schedule(() => {
      void flushBatch()
    }, CHECK_BATCH_WINDOW_MS)
  }

  function resume(row: AccessKeyLookupRow): void {
    const generation = restart(row.accessKey)
    const { state } = row
    if (state.kind === 'checking') enqueueCheck(row.accessKey)
    else if (state.kind === 'searching' && row.lookupId === null) {
      void startLookup(row.accessKey, generation)
    } else if (state.kind === 'searching' || state.kind === 'waiting') {
      schedulePoll(row.accessKey, generation, scheduler.now())
    }
  }

  return {
    add(accessKey) {
      if (rows.has(accessKey)) return { alreadyScanned: true }
      const row = createCheckingRow(accessKey)
      rows.set(accessKey, row)
      publish()
      if (isActive) resume(row)
      return { alreadyScanned: false }
    },
    start() {
      if (isActive) return
      isActive = true
      for (const row of rows.values()) resume(row)
    },
    stop() {
      isActive = false
      pollHandles.forEach((handle) => scheduler.clear(handle))
      pollHandles.clear()
      if (batchHandle !== undefined) scheduler.clear(batchHandle)
      batchHandle = undefined
      pendingBatch = []
      for (const accessKey of rows.keys())
        generations.set(accessKey, (generations.get(accessKey) ?? 0) + 1)
    },
    getRows: () => snapshot,
    markXmlImported(accessKey, documentId) {
      restart(accessKey)
      setState(accessKey, { documentId, kind: 'ready' })
    },
    async recheck(accessKey) {
      const row = rows.get(accessKey)
      if (row === undefined) return false
      try {
        const [entry] = await client.checkAccessKeys([accessKey])
        const documentId = entry?.documentId ?? null
        if (documentId === null || !isActive) return false
        restart(accessKey)
        setState(accessKey, { documentId, kind: 'ready' })
        return true
      } catch {
        return false
      }
    },
    retry(accessKey) {
      const row = rows.get(accessKey)
      if (row === undefined || !deriveRowFlags(row.state).canRetry) return
      const generation = restart(accessKey)
      setState(accessKey, { kind: 'searching', status: 'queued' })
      void startLookup(accessKey, generation)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
