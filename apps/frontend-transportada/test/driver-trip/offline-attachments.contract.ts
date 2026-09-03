/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type { DriverFieldReport } from '@/modules/driver-trip/shared/driverTrip.types'
import {
  drainQueueWithAttachments,
  enqueueAttachment,
  type AttachmentStore,
  type QueuedAttachment,
} from '@/modules/driver-trip/shared/offlineAttachments.service'
import type {
  OfflineQueueStore,
  QueuedReport,
} from '@/modules/driver-trip/shared/offlineQueue.service'

const NOW = '2026-09-03T13:00:00.000Z'

function createMemoryQueue(initial: readonly QueuedReport[] = []): OfflineQueueStore & {
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

function createMemoryAttachments(): AttachmentStore & {
  readonly entries: () => ReadonlyMap<string, readonly QueuedAttachment[]>
} {
  const entries = new Map<string, readonly QueuedAttachment[]>()
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

function deliveryReport(key: string, documentId = 'document-1'): DriverFieldReport {
  return { documentId, idempotencyKey: key, kind: 'deliver', location: null }
}

function queuedDelivery(key: string, documentId = 'document-1'): QueuedReport {
  return { attempts: 0, createdAt: NOW, report: deliveryReport(key, documentId) }
}

function photo(documentId = 'document-1', size = 10, attachmentKey = 'anexo-1'): QueuedAttachment {
  return {
    attachmentKey,
    blob: new Blob([new Uint8Array(size)], { type: 'image/jpeg' }),
    capturedAt: NOW,
    documentId,
    fileName: 'canhoto.jpg',
    kind: 'photo',
  }
}

describe('a fila offline com anexos (D6)', () => {
  it('grava o anexo referenciado pela chave do evento de entrega que ainda está na fila', async () => {
    const store = createMemoryQueue([queuedDelivery('chave-1')])
    const attachmentStore = createMemoryAttachments()

    const result = await enqueueAttachment({ attachment: photo(), attachmentStore, store })

    expect(result).toEqual({ accepted: true, eventKey: 'chave-1' })
    expect(attachmentStore.entries().get('chave-1')).toHaveLength(1)
    /** A chave de idempotência do ANEXO é gerada na captura e persiste com ele (revisão 082). */
    expect(attachmentStore.entries().get('chave-1')?.[0]?.attachmentKey).toBe('anexo-1')
  })

  it('sem evento na fila, devolve event-not-queued e não grava nada', async () => {
    const store = createMemoryQueue()
    const attachmentStore = createMemoryAttachments()

    const result = await enqueueAttachment({ attachment: photo(), attachmentStore, store })

    expect(result).toEqual({ accepted: false, reason: 'event-not-queued' })
    expect(attachmentStore.entries().size).toBe(0)
  })

  /** O teto é anunciado ANTES de qualquer escrita: nada do que já está lá é descartado. */
  it('recusa pelo teto de contagem sem descartar o que já está guardado', async () => {
    const store = createMemoryQueue([queuedDelivery('chave-1')])
    const attachmentStore = createMemoryAttachments()
    await enqueueAttachment({
      attachment: photo(),
      attachmentStore,
      limits: { maxCount: 1, maxTotalBytes: 1_000 },
      store,
    })

    const result = await enqueueAttachment({
      attachment: photo('document-1', 10, 'anexo-2'),
      attachmentStore,
      limits: { maxCount: 1, maxTotalBytes: 1_000 },
      store,
    })

    expect(result).toEqual({ accepted: false, reason: 'count-limit' })
    expect(attachmentStore.entries().get('chave-1')).toHaveLength(1)
  })

  it('recusa pelo teto de tamanho total sem descartar o que já está guardado', async () => {
    const store = createMemoryQueue([queuedDelivery('chave-1')])
    const attachmentStore = createMemoryAttachments()
    await enqueueAttachment({
      attachment: photo('document-1', 60),
      attachmentStore,
      limits: { maxCount: 10, maxTotalBytes: 100 },
      store,
    })

    const result = await enqueueAttachment({
      attachment: photo('document-1', 60, 'anexo-2'),
      attachmentStore,
      limits: { maxCount: 10, maxTotalBytes: 100 },
      store,
    })

    expect(result).toEqual({ accepted: false, reason: 'size-limit' })
    expect(attachmentStore.entries().get('chave-1')).toHaveLength(1)
  })

  it('quando o evento sobe, o blob sobe pela rota de comprovante e o par sai da fila', async () => {
    const store = createMemoryQueue([queuedDelivery('chave-1')])
    const attachmentStore = createMemoryAttachments()
    await enqueueAttachment({ attachment: photo(), attachmentStore, store })
    const sentAttachments: string[] = []

    const result = await drainQueueWithAttachments({
      attachmentStore,
      send: () => Promise.resolve({ kind: 'sent' }),
      sendAttachment: (attachment) => {
        sentAttachments.push(attachment.attachmentKey)
        return Promise.resolve({ kind: 'sent' })
      },
      store,
    })

    expect(sentAttachments).toEqual(['anexo-1'])
    expect(result).toEqual({ attachmentsRejected: 0, rejected: 0, remaining: 0, sent: 1 })
    expect(store.items()).toHaveLength(0)
    expect(attachmentStore.entries().size).toBe(0)
  })

  /**
   * Revisão 082 (4d): **o evento aceito permanece aceito.** Anexo derrubado pela rede não devolve
   * o evento à fila — o grupo de blobs fica sozinho, aguardando a próxima drenagem.
   */
  it('falha de rede no anexo mantém o blob para a próxima drenagem, sem re-POSTar o evento', async () => {
    const store = createMemoryQueue([queuedDelivery('chave-1')])
    const attachmentStore = createMemoryAttachments()
    await enqueueAttachment({ attachment: photo(), attachmentStore, store })
    const eventSends: string[] = []

    const first = await drainQueueWithAttachments({
      attachmentStore,
      send: (report) => {
        eventSends.push(report.idempotencyKey)
        return Promise.resolve({ kind: 'sent' })
      },
      sendAttachment: () => Promise.resolve({ kind: 'failed-network' }),
      store,
    })

    expect(first).toEqual({ attachmentsRejected: 0, rejected: 0, remaining: 0, sent: 1 })
    expect(store.items()).toHaveLength(0)
    expect(attachmentStore.entries().get('chave-1')).toHaveLength(1)

    const second = await drainQueueWithAttachments({
      attachmentStore,
      send: (report) => {
        eventSends.push(report.idempotencyKey)
        return Promise.resolve({ kind: 'sent' })
      },
      sendAttachment: () => Promise.resolve({ kind: 'sent' }),
      store,
    })

    /** O evento subiu uma vez só; a segunda drenagem só levou o blob. */
    expect(eventSends).toEqual(['chave-1'])
    expect(second.sent).toBe(0)
    expect(attachmentStore.entries().size).toBe(0)
  })

  /** Revisão 082 (4d): a recusa do ANEXO é do anexo — causa própria, evento intocado. */
  it('anexo rejeitado ganha causa própria e o reenvio manual não re-POSTa o evento aceito', async () => {
    const store = createMemoryQueue([queuedDelivery('chave-1')])
    const attachmentStore = createMemoryAttachments()
    await enqueueAttachment({ attachment: photo(), attachmentStore, store })
    const eventSends: string[] = []

    const first = await drainQueueWithAttachments({
      attachmentStore,
      send: (report) => {
        eventSends.push(report.idempotencyKey)
        return Promise.resolve({ kind: 'sent' })
      },
      sendAttachment: () =>
        Promise.resolve({ cause: '413 PROOF_FILE_TOO_LARGE', kind: 'rejected' }),
      store,
    })

    expect(first).toEqual({ attachmentsRejected: 1, rejected: 0, remaining: 0, sent: 1 })
    expect(store.items()).toHaveLength(0)
    expect(attachmentStore.entries().get('chave-1')?.[0]?.rejectionCause).toBe(
      '413 PROOF_FILE_TOO_LARGE',
    )

    /** Automática pula o anexo rejeitado. */
    const automatic = await drainQueueWithAttachments({
      attachmentStore,
      send: () => Promise.resolve({ kind: 'sent' }),
      sendAttachment: () => Promise.resolve({ kind: 'sent' }),
      store,
    })
    expect(automatic.attachmentsRejected).toBe(0)
    expect(attachmentStore.entries().get('chave-1')).toHaveLength(1)

    /** Manual (only) tenta o anexo de novo — e só ele. */
    const manual = await drainQueueWithAttachments({
      attachmentStore,
      only: 'chave-1',
      send: () => Promise.resolve({ kind: 'sent' }),
      sendAttachment: () => Promise.resolve({ kind: 'sent' }),
      store,
    })
    expect(manual.attachmentsRejected).toBe(0)
    expect(eventSends).toEqual(['chave-1'])
    expect(attachmentStore.entries().size).toBe(0)
  })

  it('rejeição do servidor no EVENTO marca a causa legível, à vista — nunca sumiço', async () => {
    const store = createMemoryQueue([queuedDelivery('chave-1')])
    const attachmentStore = createMemoryAttachments()

    const result = await drainQueueWithAttachments({
      attachmentStore,
      send: () => Promise.resolve({ cause: '409 TRIP_DOCUMENT_NOT_REACHABLE', kind: 'rejected' }),
      sendAttachment: () => Promise.resolve({ kind: 'sent' }),
      store,
    })

    expect(result).toEqual({ attachmentsRejected: 0, rejected: 1, remaining: 1, sent: 0 })
    expect(store.items()[0]?.rejectionCause).toBe('409 TRIP_DOCUMENT_NOT_REACHABLE')
  })

  it('a drenagem automática pula o evento rejeitado; o envio manual (only) tenta de novo', async () => {
    const rejectedItem: QueuedReport = {
      ...queuedDelivery('chave-1'),
      rejectionCause: '409 CONFLICT',
    }
    const store = createMemoryQueue([rejectedItem, queuedDelivery('chave-2', 'document-2')])
    const attachmentStore = createMemoryAttachments()
    const sent: string[] = []
    const send = (report: DriverFieldReport) => {
      sent.push(report.idempotencyKey)
      return Promise.resolve({ kind: 'sent' } as const)
    }

    await drainQueueWithAttachments({
      attachmentStore,
      send,
      sendAttachment: () => Promise.resolve({ kind: 'sent' }),
      store,
    })
    expect(sent).toEqual(['chave-2'])

    const manual = await drainQueueWithAttachments({
      attachmentStore,
      only: 'chave-1',
      send,
      sendAttachment: () => Promise.resolve({ kind: 'sent' }),
      store,
    })
    expect(sent).toEqual(['chave-2', 'chave-1'])
    expect(manual).toEqual({ attachmentsRejected: 0, rejected: 0, remaining: 0, sent: 1 })
  })

  it('falha de rede no evento para a drenagem e preserva a ordem dos seguintes', async () => {
    const store = createMemoryQueue([
      queuedDelivery('chave-1'),
      queuedDelivery('chave-2', 'document-2'),
    ])
    const attachmentStore = createMemoryAttachments()
    const attempted: string[] = []

    const result = await drainQueueWithAttachments({
      attachmentStore,
      send: (report) => {
        attempted.push(report.idempotencyKey)
        return Promise.resolve({ kind: 'failed-network' })
      },
      sendAttachment: () => Promise.resolve({ kind: 'sent' }),
      store,
    })

    expect(attempted).toEqual(['chave-1'])
    expect(result).toEqual({ attachmentsRejected: 0, rejected: 0, remaining: 2, sent: 0 })
    expect(store.items().map((item) => item.report.idempotencyKey)).toEqual(['chave-1', 'chave-2'])
  })

  it('o envio manual de um evento não toca nos vizinhos', async () => {
    const store = createMemoryQueue([
      queuedDelivery('chave-1'),
      queuedDelivery('chave-2', 'document-2'),
    ])
    const attachmentStore = createMemoryAttachments()

    const result = await drainQueueWithAttachments({
      attachmentStore,
      only: 'chave-2',
      send: () => Promise.resolve({ kind: 'sent' }),
      sendAttachment: () => Promise.resolve({ kind: 'sent' }),
      store,
    })

    expect(result).toEqual({ attachmentsRejected: 0, rejected: 0, remaining: 1, sent: 1 })
    expect(store.items().map((item) => item.report.idempotencyKey)).toEqual(['chave-1'])
  })

  /** O grupo cujo evento AINDA está na fila espera: o evento vai primeiro, sempre. */
  it('não envia anexo de evento que ainda não subiu', async () => {
    const store = createMemoryQueue([queuedDelivery('chave-1')])
    const attachmentStore = createMemoryAttachments()
    await enqueueAttachment({ attachment: photo(), attachmentStore, store })
    const sentAttachments: string[] = []

    await drainQueueWithAttachments({
      attachmentStore,
      send: () => Promise.resolve({ cause: '409 CONFLICT', kind: 'rejected' }),
      sendAttachment: (attachment) => {
        sentAttachments.push(attachment.attachmentKey)
        return Promise.resolve({ kind: 'sent' })
      },
      store,
    })

    expect(sentAttachments).toEqual([])
    expect(attachmentStore.entries().get('chave-1')).toHaveLength(1)
  })
})
