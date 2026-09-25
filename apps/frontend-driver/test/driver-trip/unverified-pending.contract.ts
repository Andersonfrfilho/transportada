/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { buildEventQueueView } from '@/modules/driver-trip/shared/eventQueueView.service'
import {
  drainQueueWithAttachments,
  enqueueAttachment,
  type QueuedAttachment,
} from '@/modules/driver-trip/shared/offlineAttachments.service'
import { enqueueReport, type QueuedReport } from '@/modules/driver-trip/shared/offlineQueue.service'
import { countPending } from '@/modules/driver-trip/shared/pendingQueue.service'
import {
  confirmUnverifiedPending,
  discardUnverifiedPending,
  summarizeUnverifiedPending,
} from '@/modules/driver-trip/shared/unverifiedPending.service'

import { createMemoryAttachments, createMemoryQueue } from '../fixtures/memory-queue-stores.fixture'

const OWNER = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)
const NOW = new Date('2026-09-25T12:00:00.000Z')
const HOOK = new URL('../../src/modules/driver-trip/hooks/useDriverTrip.hook.ts', import.meta.url)

function queued(input: {
  createdAt?: string
  isUnverified?: boolean
  key: string
  subHash?: string
}): QueuedReport {
  return {
    attempts: 0,
    createdAt: input.createdAt ?? NOW.toISOString(),
    ...(input.isUnverified === true ? { isUnverified: true } : {}),
    report: {
      documentId: 'document-1',
      idempotencyKey: input.key,
      kind: 'deliver',
      location: null,
    },
    subHash: input.subHash ?? OWNER,
  }
}

function photo(input: { isUnverified?: boolean; key: string; subHash?: string }): QueuedAttachment {
  return {
    attachmentKey: input.key,
    blob: new Blob(['x']),
    capturedAt: NOW.toISOString(),
    documentId: 'document-1',
    fileName: 'foto.jpg',
    ...(input.isUnverified === true ? { isUnverified: true } : {}),
    kind: 'photo',
    latitude: -23.55,
    longitude: -46.63,
    subHash: input.subHash ?? OWNER,
  }
}

function sendingEverything() {
  const sentReports: string[] = []
  const sentAttachments: string[] = []
  return {
    send: (report: QueuedReport['report']) => {
      sentReports.push(report.idempotencyKey)
      return Promise.resolve({ kind: 'sent' as const })
    },
    sendAttachment: (attachment: QueuedAttachment) => {
      sentAttachments.push(attachment.attachmentKey)
      return Promise.resolve({ kind: 'sent' as const })
    },
    sentAttachments,
    sentReports,
  }
}

/**
 * Decisão do usuário (spec 189 T9.2, segurança M1 — "Confirmar em lote"): sem rede, a app abre o
 * snapshot de quem usou por último **sem token** — quem tiver o celular na mão registra em nome
 * dele. O que foi gravado assim sai marcado `isUnverified`, a drenagem não o envia, e depois de
 * entrar o dono confirma com um toque ("enviar") ou descarta.
 */
describe('registros feitos sem rede esperam a confirmação do dono', () => {
  it('evento e anexo gravados sem sessão saem marcados', async () => {
    const store = createMemoryQueue()
    const attachmentStore = createMemoryAttachments()

    await enqueueReport({
      isUnverified: true,
      now: NOW,
      report: queued({ key: 'key-1' }).report,
      store,
      subHash: OWNER,
    })
    await enqueueAttachment({
      attachment: photo({ isUnverified: true, key: 'photo-1' }),
      attachmentStore,
      store,
    })

    expect(store.items()[0]?.isUnverified).toBe(true)
    expect(attachmentStore.entries().get('key-1')?.[0]?.isUnverified).toBe(true)
  })

  it('a drenagem não envia não verificado — nem o envio manual', async () => {
    const store = createMemoryQueue([queued({ isUnverified: true, key: 'key-1' })])
    const attachmentStore = createMemoryAttachments([
      ['document:document-2', [photo({ isUnverified: true, key: 'photo-2' })]],
    ])
    const sender = sendingEverything()

    await drainQueueWithAttachments({ attachmentStore, ownerSubHash: OWNER, store, ...sender })
    await drainQueueWithAttachments({
      attachmentStore,
      only: 'key-1',
      ownerSubHash: OWNER,
      store,
      ...sender,
    })

    expect(sender.sentReports).toEqual([])
    expect(sender.sentAttachments).toEqual([])
    expect(store.items()).toHaveLength(1)
  })

  it('não verificado não é drenável: o relógio da drenagem não liga por ele', () => {
    const counts = countPending({
      attachments: [
        ['key-1', [photo({ key: 'photo-1' })]],
        ['document:document-2', [photo({ isUnverified: true, key: 'photo-2' })]],
      ],
      now: NOW,
      ownerSubHash: OWNER,
      reports: [queued({ isUnverified: true, key: 'key-1' })],
    })

    expect(counts).toEqual({ drainable: 0, rejected: 0, total: 3 })
  })

  it('o resumo conta só os do dono, com a hora do primeiro', () => {
    const summary = summarizeUnverifiedPending({
      attachments: [['document:document-2', [photo({ isUnverified: true, key: 'photo-2' })]]],
      ownerSubHash: OWNER,
      reports: [
        queued({ createdAt: '2026-09-25T10:15:00.000Z', isUnverified: true, key: 'key-1' }),
        queued({ createdAt: '2026-09-25T09:40:00.000Z', isUnverified: true, key: 'key-2' }),
        queued({ isUnverified: true, key: 'key-3', subHash: OTHER }),
        queued({ key: 'key-4' }),
      ],
    })

    expect(summary).toEqual({ count: 3, firstRecordedAt: '2026-09-25T09:40:00.000Z' })
  })

  it('confirmar tira a marca só dos itens do dono, e a drenagem passa a enviá-los', async () => {
    const store = createMemoryQueue([
      queued({ isUnverified: true, key: 'key-1' }),
      queued({ isUnverified: true, key: 'key-2', subHash: OTHER }),
    ])
    const attachmentStore = createMemoryAttachments([
      ['key-1', [photo({ isUnverified: true, key: 'photo-1' })]],
    ])
    const sender = sendingEverything()

    await confirmUnverifiedPending({ attachmentStore, ownerSubHash: OWNER, store })
    await drainQueueWithAttachments({ attachmentStore, ownerSubHash: OWNER, store, ...sender })

    expect(sender.sentReports).toEqual(['key-1'])
    expect(sender.sentAttachments).toEqual(['photo-1'])
    expect(store.items().map((item) => [item.report.idempotencyKey, item.isUnverified])).toEqual([
      ['key-2', true],
    ])
  })

  it('descartar leva o evento, o blob, o documento e a posição — e só os do dono', async () => {
    const store = createMemoryQueue([
      queued({ isUnverified: true, key: 'key-1' }),
      queued({ key: 'key-verified' }),
      queued({ isUnverified: true, key: 'key-2', subHash: OTHER }),
    ])
    const attachmentStore = createMemoryAttachments([
      ['key-1', [photo({ key: 'photo-under-discarded-event' })]],
      ['document:document-2', [photo({ isUnverified: true, key: 'photo-2' })]],
      ['key-verified', [photo({ key: 'photo-kept' })]],
    ])

    const discarded = await discardUnverifiedPending({
      attachmentStore,
      ownerSubHash: OWNER,
      store,
    })

    expect(discarded).toBe(3)
    expect(store.items().map((item) => item.report.idempotencyKey)).toEqual([
      'key-verified',
      'key-2',
    ])
    expect([...attachmentStore.entries().keys()]).toEqual(['key-verified'])
  })

  it('a fila na tela diz "aguardando sua confirmação", não "na fila"', () => {
    const view = buildEventQueueView({
      attachments: [['document:document-2', [photo({ isUnverified: true, key: 'photo-2' })]]],
      queued: [queued({ isUnverified: true, key: 'key-1' })],
    })

    expect(view.map((item) => item.status)).toEqual([
      { state: 'unverified' },
      { state: 'unverified' },
    ])
  })

  it('o hook marca o que grava sem sessão, nos três caminhos', () => {
    const hook = readFileSync(HOOK, 'utf8')

    expect(hook.match(/isUnverified: !session\.canSync/gu)?.length).toBe(3)
  })

  /**
   * Segunda leitura (N3): "Cheguei" sem rede (não verificado) e "Entreguei" depois de entrar. Drenar
   * o segundo antes do primeiro entregava numa parada em que o servidor não sabe que ele chegou — e
   * o "Cheguei" confirmado depois levava 409. A drenagem para no primeiro não verificado do dono.
   */
  it('a drenagem para no primeiro não verificado do dono e preserva a ordem', async () => {
    const store = createMemoryQueue([
      queued({ isUnverified: true, key: 'arrive-offline' }),
      queued({ key: 'deliver-online' }),
    ])
    const attachmentStore = createMemoryAttachments([
      ['deliver-online', [photo({ key: 'photo-of-deliver' })]],
    ])
    const sender = sendingEverything()

    await drainQueueWithAttachments({ attachmentStore, ownerSubHash: OWNER, store, ...sender })
    await drainQueueWithAttachments({
      attachmentStore,
      only: 'deliver-online',
      ownerSubHash: OWNER,
      store,
      ...sender,
    })
    expect(sender.sentReports).toEqual([])
    expect(sender.sentAttachments).toEqual([])

    await confirmUnverifiedPending({ attachmentStore, ownerSubHash: OWNER, store })
    await drainQueueWithAttachments({ attachmentStore, ownerSubHash: OWNER, store, ...sender })

    expect(sender.sentReports).toEqual(['arrive-offline', 'deliver-online'])
    expect(sender.sentAttachments).toEqual(['photo-of-deliver'])
  })

  it('o item de outra conta não segura a fila do dono', async () => {
    const store = createMemoryQueue([
      queued({ isUnverified: true, key: 'foreign-offline', subHash: OTHER }),
      queued({ key: 'own-online' }),
    ])
    const sender = sendingEverything()

    await drainQueueWithAttachments({
      attachmentStore: createMemoryAttachments(),
      ownerSubHash: OWNER,
      store,
      ...sender,
    })

    expect(sender.sentReports).toEqual(['own-online'])
  })

  it('o que fica atrás do não verificado não é drenável: o relógio não liga por ele', () => {
    const counts = countPending({
      attachments: [['deliver-online', [photo({ key: 'photo-of-deliver' })]]],
      now: NOW,
      ownerSubHash: OWNER,
      reports: [
        queued({ isUnverified: true, key: 'arrive-offline' }),
        queued({ key: 'deliver-online' }),
      ],
    })

    expect(counts).toEqual({ drainable: 0, rejected: 0, total: 3 })
  })
})
