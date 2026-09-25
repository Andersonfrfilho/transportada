/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  AttachmentStore,
  QueuedAttachment,
} from '@/modules/driver-trip/shared/offlineAttachments.service'
import type {
  OfflineQueueStore,
  QueuedReport,
} from '@/modules/driver-trip/shared/offlineQueue.service'

/** A fila de eventos em memória, com a mesma semântica de ler-e-escrever do IndexedDB. */
export function createMemoryQueue(initial: readonly QueuedReport[] = []): OfflineQueueStore & {
  readonly items: () => readonly QueuedReport[]
} {
  let items = [...initial]
  return {
    items: () => items,
    read: () => Promise.resolve(items),
    update: (mutate) => {
      items = [...mutate(items)]
      return Promise.resolve(items)
    },
  }
}

/** Os anexos em memória: lista vazia apaga a chave, como `deleteWhenEmpty` no IndexedDB. */
export function createMemoryAttachments(
  initial: readonly (readonly [string, readonly QueuedAttachment[]])[] = [],
): AttachmentStore & {
  readonly entries: () => ReadonlyMap<string, readonly QueuedAttachment[]>
} {
  const entries = new Map<string, readonly QueuedAttachment[]>(initial)
  return {
    entries: () => entries,
    read: (eventKey) => Promise.resolve(entries.get(eventKey) ?? []),
    readAll: () =>
      Promise.resolve([...entries.entries()].map(([key, items]) => [key, items] as const)),
    readTotals: () => {
      const all = [...entries.values()].flat()
      return Promise.resolve({
        count: all.length,
        totalBytes: all.reduce((total, item) => total + item.blob.size, 0),
      })
    },
    remove: (eventKey) => {
      entries.delete(eventKey)
      return Promise.resolve()
    },
    update: (input) => {
      const next = input.mutate(entries.get(input.eventKey) ?? [])
      if (next.length === 0) entries.delete(input.eventKey)
      else entries.set(input.eventKey, [...next])
      return Promise.resolve(next)
    },
  }
}
