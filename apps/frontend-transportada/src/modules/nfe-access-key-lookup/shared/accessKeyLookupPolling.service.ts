/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  LOOKUP_POLL_INTERVAL_MS,
  LOOKUP_POLL_MAX_DURATION_MS,
  LOOKUP_POLL_MAX_FAILURES,
  REQUEST_FAILED_CODE,
} from './accessKeyLookup.constant'
import {
  AccessKeyLookupRequestError,
  type AccessKeyLookupClient,
} from './accessKeyLookupClient.service'
import {
  deriveRowFlags,
  stateFromLookupView,
  stateFromRequestResult,
  type AccessKeyLookupRowState,
} from './accessKeyLookupRow.service'
import type { RowStore } from './accessKeyLookupRowStore.service'
import type { QueueScheduler } from './accessKeyLookupScheduler.service'

export type LookupPoller = Readonly<{
  schedulePoll: (accessKey: string, generation: number) => void
  startLookup: (accessKey: string, generation: number) => Promise<void>
}>

export function toErrorState(error: unknown): AccessKeyLookupRowState {
  const code = error instanceof AccessKeyLookupRequestError ? error.code : REQUEST_FAILED_CODE
  return { code, kind: 'error' }
}

type PollOutcome = Readonly<{ state: AccessKeyLookupRowState }> | Readonly<{ error: unknown }>

/** Pedido da busca e acompanhamento por polling; o teto de 10 min conta da primeira consulta. */
export function createLookupPoller(
  deps: Readonly<{ client: AccessKeyLookupClient; scheduler: QueueScheduler; store: RowStore }>,
): LookupPoller {
  const { client, scheduler, store } = deps

  function schedulePoll(accessKey: string, generation: number): void {
    if (!store.startedAt.has(accessKey)) store.startedAt.set(accessKey, scheduler.now())
    store.pollHandles.set(
      accessKey,
      scheduler.schedule(() => {
        void poll(accessKey, generation)
      }, LOOKUP_POLL_INTERVAL_MS),
    )
  }

  function isPastCap(accessKey: string): boolean {
    const startedAt = store.startedAt.get(accessKey) ?? scheduler.now()
    return scheduler.now() - startedAt >= LOOKUP_POLL_MAX_DURATION_MS
  }

  async function fetchOutcome(lookupId: string): Promise<PollOutcome> {
    try {
      return { state: stateFromLookupView(await client.getLookup(lookupId)) }
    } catch (error) {
      return { error }
    }
  }

  function handleFailure(accessKey: string, generation: number, error: unknown): void {
    const failures = (store.failures.get(accessKey) ?? 0) + 1
    if (failures > LOOKUP_POLL_MAX_FAILURES || isPastCap(accessKey)) {
      store.setState(accessKey, toErrorState(error))
      return
    }
    store.failures.set(accessKey, failures)
    schedulePoll(accessKey, generation)
  }

  async function poll(accessKey: string, generation: number): Promise<void> {
    const lookupId = store.get(accessKey)?.lookupId
    if (lookupId === null || lookupId === undefined) return
    const outcome = await fetchOutcome(lookupId)
    if (!store.isCurrent(accessKey, generation)) return
    if ('error' in outcome) {
      handleFailure(accessKey, generation, outcome.error)
      return
    }
    store.failures.delete(accessKey)
    const { state } = outcome
    if (deriveRowFlags(state).isTerminal || state.kind === 'error') {
      store.setState(accessKey, state)
    } else if (isPastCap(accessKey)) {
      store.setState(accessKey, { kind: 'stalled' })
    } else {
      store.setState(accessKey, state)
      schedulePoll(accessKey, generation)
    }
  }

  async function startLookup(accessKey: string, generation: number): Promise<void> {
    let state: AccessKeyLookupRowState
    let lookupId: null | string = null
    try {
      const result = await client.requestLookup(accessKey)
      state = stateFromRequestResult(result)
      if (result.kind === 'lookup') lookupId = result.lookup.id
    } catch (error) {
      if (store.isCurrent(accessKey, generation)) store.setState(accessKey, toErrorState(error))
      return
    }
    if (!store.isCurrent(accessKey, generation)) return
    store.setState(accessKey, state, lookupId ?? undefined)
    if (state.kind === 'searching' || state.kind === 'waiting') schedulePoll(accessKey, generation)
  }

  return { schedulePoll, startLookup }
}
