/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createCheckBatcher } from './accessKeyLookupBatch.service'
import { createLookupPoller } from './accessKeyLookupPolling.service'
import {
  createCheckingRow,
  deriveRowFlags,
  withState,
  type AccessKeyLookupRow,
} from './accessKeyLookupRow.service'
import { createRowStore } from './accessKeyLookupRowStore.service'
import { BROWSER_SCHEDULER, type QueueScheduler } from './accessKeyLookupScheduler.service'
import type {
  AccessKeyLookupQueue,
  AccessKeyLookupQueueOptions,
} from './accessKeyLookupQueue.types'

export { BROWSER_SCHEDULER, type QueueScheduler }
export type {
  AccessKeyLookupQueue,
  AccessKeyLookupQueueOptions,
  AddAccessKeyResult,
  RestoredAccessKey,
} from './accessKeyLookupQueue.types'

export function createAccessKeyLookupQueue(
  options: AccessKeyLookupQueueOptions,
): AccessKeyLookupQueue {
  const { client } = options
  const scheduler = options.scheduler ?? BROWSER_SCHEDULER
  const store = createRowStore(scheduler)
  const poller = createLookupPoller({ client, scheduler, store })
  const batcher = createCheckBatcher({
    client,
    onMissing: (accessKey, generation) => {
      void poller.startLookup(accessKey, generation)
    },
    scheduler,
    store,
  })

  function resume(row: AccessKeyLookupRow): void {
    const generation = store.restart(row.accessKey)
    const { state } = row
    if (state.kind === 'checking') batcher.enqueue(row.accessKey)
    else if (state.kind === 'searching' && row.lookupId === null) {
      void poller.startLookup(row.accessKey, generation)
    } else if (state.kind === 'searching' || state.kind === 'waiting') {
      poller.schedulePoll(row.accessKey, generation)
    }
  }

  function discardTimers(): void {
    store.invalidateAll()
    batcher.cancel()
  }

  function settleReady(accessKey: string, documentId: string): void {
    store.restart(accessKey)
    store.startedAt.delete(accessKey)
    store.setState(accessKey, { documentId, kind: 'ready' })
  }

  return {
    add(accessKey) {
      if (store.rows.has(accessKey)) return { alreadyScanned: true }
      const row = createCheckingRow(accessKey)
      store.rows.set(accessKey, row)
      store.publish()
      if (store.isActive()) resume(row)
      return { alreadyScanned: false }
    },
    start() {
      if (store.isActive()) return
      store.setActive(true)
      for (const row of store.rows.values()) resume(row)
    },
    stop() {
      store.setActive(false)
      discardTimers()
    },
    getRows: store.getSnapshot,
    clear() {
      discardTimers()
      store.rows.clear()
      store.startedAt.clear()
      store.failures.clear()
      store.publish()
    },
    restore(entries) {
      for (const entry of entries) {
        if (store.rows.has(entry.accessKey)) continue
        const base = createCheckingRow(entry.accessKey)
        const row: AccessKeyLookupRow =
          entry.lookupId === null
            ? { ...base, wasRegistered: entry.wasRegistered }
            : withState(base, { kind: 'searching', status: 'queued' }, entry.lookupId)
        store.rows.set(entry.accessKey, row)
        if (store.isActive()) resume(row)
      }
      store.publish()
    },
    markXmlImported: settleReady,
    async recheck(accessKey) {
      if (store.get(accessKey) === undefined) return false
      try {
        const [entry] = await client.checkAccessKeys([accessKey])
        const documentId = entry?.documentId ?? null
        if (documentId === null || !store.isActive()) return false
        settleReady(accessKey, documentId)
        return true
      } catch {
        return false
      }
    },
    retry(accessKey) {
      const row = store.get(accessKey)
      if (row === undefined || !deriveRowFlags(row.state).canRetry) return
      const generation = store.restart(accessKey)
      store.startedAt.delete(accessKey)
      store.setState(accessKey, { kind: 'searching', status: 'queued' })
      void poller.startLookup(accessKey, generation)
    },
    subscribe: store.subscribe,
  }
}
