/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  buildEventQueueView,
  resolveQueuedProofAttachments,
} from '@/modules/driver-trip/shared/eventQueueView.service'
import {
  enqueueAttachment,
  releaseAttachmentsAwaitingDelivery,
  type QueuedAttachment,
} from '@/modules/driver-trip/shared/offlineAttachments.service'
import type { QueuedReport } from '@/modules/driver-trip/shared/offlineQueue.service'

import { createMemoryAttachments, createMemoryQueue } from '../fixtures/memory-queue-stores.fixture'

const NOW = '2026-09-29T13:00:00.000Z'

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

const CARD = readSource('src/modules/driver-trip/components/DriverStopCard.component.tsx')
const PREVIEW_HOOK = readSource('src/modules/driver-trip/hooks/usePhotoPreviewUrl.hook.ts')

function attachment(input: {
  readonly documentId?: string
  readonly key: string
  readonly kind?: QueuedAttachment['kind']
}): QueuedAttachment {
  return {
    attachmentKey: input.key,
    blob: new Blob([input.key], { type: 'image/jpeg' }),
    capturedAt: NOW,
    documentId: input.documentId ?? 'document-1',
    fileName: 'canhoto.jpg',
    kind: input.kind ?? 'photo',
  }
}

function queuedDeliver(key: string): QueuedReport {
  return {
    attempts: 0,
    createdAt: NOW,
    report: { documentId: 'document-1', idempotencyKey: key, kind: 'deliver', location: null },
  }
}

/**
 * Spec 218 (pendência da Fase 4): depois do "Confirmar entrega", o snapshot passa a nota ao ramo
 * "entregue", e a `DeliveryProofSection` nova nascia vazia ("Tirar foto *" de novo) com o canhoto
 * ainda na fila. A captura nasce do que a fila já guarda para a nota — no grupo de espera, no do
 * evento de entrega, ou no grupo órfão depois que a entrega subiu.
 */
describe('a captura nasce do que a fila guarda para a nota (spec 218)', () => {
  it('a foto do gate, ainda esperando a entrega, já conta como anexada', async () => {
    const store = createMemoryQueue()
    const attachmentStore = createMemoryAttachments()
    await enqueueAttachment({
      attachment: attachment({ key: 'anexo-1' }),
      attachmentStore,
      awaitingDelivery: true,
      store,
    })

    const queueView = buildEventQueueView({
      attachments: await attachmentStore.readAll(),
      queued: await store.read(),
    })
    const queued = resolveQueuedProofAttachments({ documentId: 'document-1', queueView })
    expect(queued.photo?.attachmentKey).toBe('anexo-1')
    expect(queued.photo?.blob).toBeInstanceOf(Blob)
    expect(queued.signature).toBeUndefined()
  })

  it('solta para o grupo da entrega enfileirada, continua anexada', async () => {
    const store = createMemoryQueue([queuedDeliver('entrega-1')])
    const attachmentStore = createMemoryAttachments()
    await enqueueAttachment({
      attachment: attachment({ key: 'anexo-1' }),
      attachmentStore,
      awaitingDelivery: true,
      store: createMemoryQueue(),
    })
    await releaseAttachmentsAwaitingDelivery({
      attachmentStore,
      documentId: 'document-1',
      eventKey: 'entrega-1',
    })

    const queueView = buildEventQueueView({
      attachments: await attachmentStore.readAll(),
      queued: await store.read(),
    })
    expect(queueView.find((item) => item.kind === 'deliver')?.proofAttachments).toHaveLength(1)
    expect(
      resolveQueuedProofAttachments({ documentId: 'document-1', queueView }).photo?.attachmentKey,
    ).toBe('anexo-1')
  })

  it('a entrega já subiu e o canhoto ainda não — o grupo órfão também conta', () => {
    const queueView = buildEventQueueView({
      attachments: [['entrega-1', [attachment({ key: 'anexo-1' })]]],
      queued: [],
    })
    expect(
      resolveQueuedProofAttachments({ documentId: 'document-1', queueView }).photo?.attachmentKey,
    ).toBe('anexo-1')
  })

  it('foto e assinatura por kind, a última de cada vence, e nota alheia não entra', () => {
    const queueView = buildEventQueueView({
      attachments: [
        [
          'entrega-1',
          [
            attachment({ key: 'foto-antiga' }),
            attachment({ key: 'assinatura-1', kind: 'signature' }),
            attachment({ key: 'foto-nova' }),
          ],
        ],
        ['awaiting-delivery:document-2', [attachment({ documentId: 'document-2', key: 'alheia' })]],
      ],
      queued: [],
    })
    const queued = resolveQueuedProofAttachments({ documentId: 'document-1', queueView })
    expect(queued.photo?.attachmentKey).toBe('foto-nova')
    expect(queued.signature?.attachmentKey).toBe('assinatura-1')
    expect(resolveQueuedProofAttachments({ documentId: 'document-3', queueView })).toEqual({})
  })
})

describe('a captura lê a fila uma vez, ao nascer (spec 218)', () => {
  function captureSource(): string {
    const start = CARD.indexOf('function ProofCaptureFields(')
    expect(start).toBeGreaterThan(-1)
    return CARD.slice(start, CARD.indexOf('function currentFields(', start))
  }

  it('anexada, chave e miniatura começam do que a fila guarda — nunca sempre vazias', () => {
    const capture = captureSource()
    expect(capture).toInclude(
      'useState(() => resolveQueuedProofAttachments({ documentId, queueView }))',
    )
    expect(capture).toInclude('photo: queuedAtMount.photo !== undefined')
    expect(capture).toInclude('signature: queuedAtMount.signature !== undefined')
    expect(capture).toInclude('{ photo: queuedAtMount.photo.attachmentKey }')
    expect(capture).toInclude('{ signature: queuedAtMount.signature.attachmentKey }')
    expect(capture).toInclude('usePhotoPreviewUrl(queuedAtMount.photo?.blob)')
    expect(capture).toInclude('usePhotoPreviewUrl(queuedAtMount.signature?.blob)')
  })

  it('a miniatura aceita nascer de um arquivo já guardado', () => {
    expect(PREVIEW_HOOK).toInclude('export function usePhotoPreviewUrl(initialBlob?: Blob)')
  })
})
