/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type { DriverFieldReport } from '@/modules/driver-trip/shared/driverTrip.types'
import {
  drainQueueWithAttachments,
  enqueueAttachment,
  type AttachmentGroupEntries,
  type AttachmentSendOutcome,
  type AttachmentStore,
  type QueuedAttachment,
} from '@/modules/driver-trip/shared/offlineAttachments.service'
import {
  enqueueReport,
  type OfflineQueueStore,
  type QueuedReport,
} from '@/modules/driver-trip/shared/offlineQueue.service'
import {
  discardForeignPending,
  partitionPendingByOwner,
} from '@/modules/driver-trip/shared/queueOwner.service'

const NOW = new Date('2026-09-25T12:00:00.000Z')
const OWNER = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)

function createMemoryStore(initial: readonly QueuedReport[] = []): OfflineQueueStore & {
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

function createMemoryAttachmentStore(): AttachmentStore & {
  readonly groups: () => AttachmentGroupEntries
} {
  const groups = new Map<string, readonly QueuedAttachment[]>()
  return {
    groups: () => [...groups.entries()],
    read: (eventKey) => Promise.resolve(groups.get(eventKey) ?? []),
    readAll: () => Promise.resolve([...groups.entries()]),
    readTotals: () => {
      const items = [...groups.values()].flat()
      return Promise.resolve({
        count: items.length,
        totalBytes: items.reduce((total, item) => total + item.blob.size, 0),
      })
    },
    remove: (eventKey) => {
      groups.delete(eventKey)
      return Promise.resolve()
    },
    update: ({ eventKey, mutate }) => {
      const next = mutate(groups.get(eventKey) ?? [])
      if (next.length === 0) groups.delete(eventKey)
      else groups.set(eventKey, next)
      return Promise.resolve(next)
    },
  }
}

function arrival(key: string): DriverFieldReport {
  return { idempotencyKey: key, kind: 'arrive', location: null, stopId: 'stop-1' }
}

function photo(input: { documentId: string; key: string; subHash: string }): QueuedAttachment {
  return {
    attachmentKey: input.key,
    blob: new Blob(['x']),
    capturedAt: NOW.toISOString(),
    documentId: input.documentId,
    fileName: 'foto.jpg',
    kind: 'photo',
    subHash: input.subHash,
  }
}

async function queueOf(input: {
  readonly attachments: readonly QueuedAttachment[]
  readonly reports: ReadonlyArray<readonly [key: string, subHash: string]>
}): Promise<{
  attachmentStore: ReturnType<typeof createMemoryAttachmentStore>
  store: ReturnType<typeof createMemoryStore>
}> {
  const store = createMemoryStore()
  const attachmentStore = createMemoryAttachmentStore()
  for (const [key, subHash] of input.reports) {
    await enqueueReport({ now: NOW, report: arrival(key), store, subHash })
  }
  for (const attachment of input.attachments) {
    await enqueueAttachment({ attachment, attachmentStore, store })
  }
  return { attachmentStore, store }
}

describe('a fila tem dono (plan D5, ADR-0075 §8)', () => {
  it('o item enfileirado leva o subHash de quem tocou', async () => {
    const { store } = await queueOf({ attachments: [], reports: [['chave-1', OWNER]] })

    expect(store.items()[0]?.subHash).toBe(OWNER)
  })

  it('a drenagem só envia o que é do sub autenticado — o resto fica, intocado', async () => {
    const { attachmentStore, store } = await queueOf({
      attachments: [
        photo({ documentId: 'doc-own', key: 'anexo-own', subHash: OWNER }),
        photo({ documentId: 'doc-other', key: 'anexo-other', subHash: OTHER }),
      ],
      reports: [
        ['chave-own', OWNER],
        ['chave-other', OTHER],
      ],
    })
    const sentReports: string[] = []
    const sentAttachments: string[] = []

    const result = await drainQueueWithAttachments({
      attachmentStore,
      ownerSubHash: OWNER,
      send: (report): Promise<AttachmentSendOutcome> => {
        sentReports.push(report.idempotencyKey)
        return Promise.resolve({ kind: 'sent' })
      },
      sendAttachment: (attachment): Promise<AttachmentSendOutcome> => {
        sentAttachments.push(attachment.attachmentKey)
        return Promise.resolve({ kind: 'sent' })
      },
      store,
    })

    expect(sentReports).toEqual(['chave-own'])
    expect(sentAttachments).toEqual(['anexo-own'])
    expect(result.sent).toBe(1)
    expect(store.items().map((item) => item.report.idempotencyKey)).toEqual(['chave-other'])
    expect(
      attachmentStore.groups().flatMap(([, items]) => items.map((i) => i.attachmentKey)),
    ).toEqual(['anexo-other'])
  })

  it('nem o envio manual de um item de outra conta sai', async () => {
    const { attachmentStore, store } = await queueOf({
      attachments: [],
      reports: [['chave-other', OTHER]],
    })
    let sendCalls = 0

    await drainQueueWithAttachments({
      attachmentStore,
      only: 'chave-other',
      ownerSubHash: OWNER,
      send: () => {
        sendCalls += 1
        return Promise.resolve({ kind: 'sent' })
      },
      sendAttachment: () => Promise.resolve({ kind: 'sent' }),
      store,
    })

    expect(sendCalls).toBe(0)
    expect(store.items()).toHaveLength(1)
  })

  it('item sem dono conta como de outra conta', async () => {
    const store = createMemoryStore([
      { attempts: 0, createdAt: NOW.toISOString(), report: arrival('chave-antiga') },
    ])
    let sendCalls = 0

    await drainQueueWithAttachments({
      attachmentStore: createMemoryAttachmentStore(),
      ownerSubHash: OWNER,
      send: () => {
        sendCalls += 1
        return Promise.resolve({ kind: 'sent' })
      },
      sendAttachment: () => Promise.resolve({ kind: 'sent' }),
      store,
    })

    expect(sendCalls).toBe(0)
  })

  it('a recusa do servidor mantém o dono do item', async () => {
    const { attachmentStore, store } = await queueOf({
      attachments: [],
      reports: [['chave-own', OWNER]],
    })

    await drainQueueWithAttachments({
      attachmentStore,
      ownerSubHash: OWNER,
      send: () => Promise.resolve({ cause: '409 CONFLICT', kind: 'rejected' }),
      sendAttachment: () => Promise.resolve({ kind: 'sent' }),
      store,
    })

    expect(store.items()[0]?.rejectionCause).toBe('409 CONFLICT')
    expect(store.items()[0]?.subHash).toBe(OWNER)
  })

  it('pendências de outra conta: separadas e contadas, para o aviso com "Descartar"', async () => {
    const { attachmentStore, store } = await queueOf({
      attachments: [
        photo({ documentId: 'doc-own', key: 'anexo-own', subHash: OWNER }),
        photo({ documentId: 'doc-other', key: 'anexo-other', subHash: OTHER }),
      ],
      reports: [
        ['chave-own', OWNER],
        ['chave-other', OTHER],
      ],
    })

    const partition = partitionPendingByOwner({
      attachments: await attachmentStore.readAll(),
      ownerSubHash: OWNER,
      reports: await store.read(),
    })

    expect(partition.ownReports.map((item) => item.report.idempotencyKey)).toEqual(['chave-own'])
    expect(
      partition.ownAttachments.flatMap(([, items]) => items.map((item) => item.attachmentKey)),
    ).toEqual(['anexo-own'])
    expect(partition.foreignCount).toBe(2)
  })

  it('"Descartar" apaga só as pendências de outra conta, com o dado junto', async () => {
    const { attachmentStore, store } = await queueOf({
      attachments: [
        photo({ documentId: 'doc-own', key: 'anexo-own', subHash: OWNER }),
        photo({ documentId: 'doc-other', key: 'anexo-other', subHash: OTHER }),
      ],
      reports: [
        ['chave-own', OWNER],
        ['chave-other', OTHER],
      ],
    })

    const discarded = await discardForeignPending({ attachmentStore, ownerSubHash: OWNER, store })

    expect(discarded).toBe(2)
    expect(store.items().map((item) => item.report.idempotencyKey)).toEqual(['chave-own'])
    expect(
      attachmentStore.groups().flatMap(([, items]) => items.map((i) => i.attachmentKey)),
    ).toEqual(['anexo-own'])
  })
})
