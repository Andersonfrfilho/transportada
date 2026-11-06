/* Copyright (c) 2026 Ada Technology. MIT License. */
import { CHECK_BATCH_MAX_KEYS, CHECK_BATCH_WINDOW_MS } from './accessKeyLookup.constant'
import type { AccessKeyLookupClient } from './accessKeyLookupClient.service'
import { toErrorState } from './accessKeyLookupPolling.service'
import type { RowStore } from './accessKeyLookupRowStore.service'
import type { QueueScheduler } from './accessKeyLookupScheduler.service'

export type CheckBatcher = Readonly<{
  cancel: () => void
  enqueue: (accessKey: string) => void
}>

/** Junta as chaves lidas numa janela de 500 ms (ou 200 chaves) numa só conferência de cadastro. */
export function createCheckBatcher(
  deps: Readonly<{
    client: AccessKeyLookupClient
    onMissing: (accessKey: string, generation: number) => void
    scheduler: QueueScheduler
    store: RowStore
  }>,
): CheckBatcher {
  const { client, onMissing, scheduler, store } = deps
  let pendingBatch: string[] = []
  let batchHandle: unknown

  function cancel(): void {
    if (batchHandle !== undefined) scheduler.clear(batchHandle)
    batchHandle = undefined
    pendingBatch = []
  }

  async function flush(): Promise<void> {
    const accessKeys = pendingBatch
    cancel()
    if (accessKeys.length === 0) return
    const generationsAtSend = new Map(accessKeys.map((key) => [key, store.generationOf(key)]))
    let entries: Awaited<ReturnType<AccessKeyLookupClient['checkAccessKeys']>>
    try {
      entries = await client.checkAccessKeys(accessKeys)
    } catch (error) {
      for (const key of accessKeys) {
        if (store.isCurrent(key, generationsAtSend.get(key) ?? 0))
          store.setState(key, toErrorState(error))
      }
      return
    }
    const documentIds = new Map(entries.map((entry) => [entry.accessKey, entry.documentId]))
    for (const key of accessKeys) {
      const generation = generationsAtSend.get(key) ?? 0
      if (!store.isCurrent(key, generation)) continue
      const documentId = documentIds.get(key) ?? null
      if (documentId !== null) store.markRegistered(key, documentId)
      else onMissing(key, generation)
    }
  }

  function enqueue(accessKey: string): void {
    pendingBatch.push(accessKey)
    if (pendingBatch.length >= CHECK_BATCH_MAX_KEYS) {
      void flush()
      return
    }
    batchHandle ??= scheduler.schedule(() => {
      void flush()
    }, CHECK_BATCH_WINDOW_MS)
  }

  return { cancel, enqueue }
}
