/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type {
  AttachmentStore,
  QueuedAttachment,
} from '@/modules/driver-trip/shared/offlineAttachments.service'
import type {
  OfflineQueueStore,
  QueuedReport,
} from '@/modules/driver-trip/shared/offlineQueue.service'
import { discardRejectedQueueItem } from '@/modules/driver-trip/shared/queueDiscard.service'

const NOW = '2026-09-25T12:00:00.000Z'

function createMemoryQueue(initial: readonly QueuedReport[]): OfflineQueueStore & {
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

function createMemoryAttachments(
  initial: readonly (readonly [string, readonly QueuedAttachment[]])[],
): AttachmentStore & { readonly entries: () => ReadonlyMap<string, readonly QueuedAttachment[]> } {
  const entries = new Map<string, readonly QueuedAttachment[]>(initial)
  return {
    entries: () => entries,
    read: (eventKey) => Promise.resolve(entries.get(eventKey) ?? []),
    readAll: () => Promise.resolve([...entries.entries()]),
    readTotals: () => Promise.resolve({ count: 0, totalBytes: 0 }),
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

function delivery(key: string, rejectionCause?: string): QueuedReport {
  return {
    attempts: 0,
    createdAt: NOW,
    ...(rejectionCause === undefined ? {} : { rejectionCause }),
    report: { documentId: 'document-1', idempotencyKey: key, kind: 'deliver', location: null },
  }
}

function photo(attachmentKey: string, rejectionCause?: string): QueuedAttachment {
  return {
    attachmentKey,
    blob: new Blob(['x'], { type: 'image/jpeg' }),
    capturedAt: NOW,
    documentId: 'document-1',
    fileName: 'canhoto.jpg',
    kind: 'photo',
    ...(rejectionCause === undefined ? {} : { rejectionCause }),
  }
}

/**
 * Decisão do usuário (ADR-0075 §6, "descartar com ciência"): o recusado pelo servidor nunca sobe
 * sozinho, e sem descarte a fila antiga nunca esvaziaria — o motorista ficaria preso no painel. O
 * descarte tira **só o que foi recusado**, e o dado vai junto (o blob e a posição, não só a linha).
 */
describe('descartar o recusado da fila antiga', () => {
  it('evento recusado sai da fila com os anexos dele', async () => {
    const store = createMemoryQueue([delivery('chave-1', '409 CONFLICT'), delivery('chave-2')])
    const attachmentStore = createMemoryAttachments([
      ['chave-1', [photo('anexo-1')]],
      ['chave-2', [photo('anexo-2')]],
    ])

    await discardRejectedQueueItem({ attachmentStore, idempotencyKey: 'chave-1', store })

    expect(store.items().map((item) => item.report.idempotencyKey)).toEqual(['chave-2'])
    expect([...attachmentStore.entries().keys()]).toEqual(['chave-2'])
  })

  /** Evento aceito permanece aceito: o descarte é do arquivo recusado, e o resto do grupo sobe. */
  it('anexo recusado sai sozinho; o evento e os outros anexos ficam', async () => {
    const store = createMemoryQueue([delivery('chave-1')])
    const attachmentStore = createMemoryAttachments([
      ['chave-1', [photo('anexo-1', '422 INVALID'), photo('anexo-2')]],
      ['document:document-9', [photo('anexo-9', '422 INVALID')]],
    ])

    await discardRejectedQueueItem({ attachmentStore, idempotencyKey: 'chave-1', store })
    await discardRejectedQueueItem({
      attachmentStore,
      idempotencyKey: 'document:document-9',
      store,
    })

    expect(store.items()).toHaveLength(1)
    expect(
      attachmentStore
        .entries()
        .get('chave-1')
        ?.map((item) => item.attachmentKey),
    ).toEqual(['anexo-2'])
    expect(attachmentStore.entries().has('document:document-9')).toBe(false)
  })

  it('o que não foi recusado não se descarta', async () => {
    const store = createMemoryQueue([delivery('chave-1')])
    const attachmentStore = createMemoryAttachments([['chave-1', [photo('anexo-1')]]])

    await discardRejectedQueueItem({ attachmentStore, idempotencyKey: 'chave-1', store })

    expect(store.items()).toHaveLength(1)
    expect(attachmentStore.entries().get('chave-1')).toHaveLength(1)
  })
})
