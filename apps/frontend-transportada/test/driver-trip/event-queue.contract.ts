/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  buildEventQueueView,
  hasSendableEvents,
} from '@/modules/driver-trip/shared/eventQueueView.service'
import type { QueuedReport } from '@/modules/driver-trip/shared/offlineQueue.service'

const NOW = '2026-09-03T13:00:00.000Z'

function queuedItem(input: {
  readonly attempts?: number
  readonly key: string
  readonly rejectionCause?: string
}): QueuedReport {
  return {
    attempts: input.attempts ?? 0,
    createdAt: NOW,
    ...(input.rejectionCause === undefined ? {} : { rejectionCause: input.rejectionCause }),
    report: {
      documentId: 'document-1',
      idempotencyKey: input.key,
      kind: 'deliver',
      location: null,
    },
  }
}

describe('a tela de eventos pendentes (D7)', () => {
  it('deriva tipo, hora e contagem de anexos de cada item da fila', () => {
    const views = buildEventQueueView({
      attachmentCounts: { 'chave-1': 2 },
      queued: [queuedItem({ key: 'chave-1' }), queuedItem({ key: 'chave-2' })],
    })

    expect(views).toEqual([
      {
        attachmentCount: 2,
        idempotencyKey: 'chave-1',
        kind: 'deliver',
        queuedAt: NOW,
        status: { state: 'queued' },
      },
      {
        attachmentCount: 0,
        idempotencyKey: 'chave-2',
        kind: 'deliver',
        queuedAt: NOW,
        status: { state: 'queued' },
      },
    ])
  })

  it('item que a rede recusou aparece como falhou N vezes', () => {
    const views = buildEventQueueView({
      attachmentCounts: {},
      queued: [queuedItem({ attempts: 3, key: 'chave-1' })],
    })

    expect(views[0]?.status).toEqual({ attempts: 3, state: 'failed' })
  })

  /** A causa gravada na recusa chega inteira à tela — status + código, nunca um genérico. */
  it('item rejeitado carrega a causa legível, e a rejeição vence a contagem de tentativas', () => {
    const views = buildEventQueueView({
      attachmentCounts: {},
      queued: [queuedItem({ attempts: 2, key: 'chave-1', rejectionCause: '409 CONFLICT' })],
    })

    expect(views[0]?.status).toEqual({ cause: '409 CONFLICT', state: 'rejected' })
  })

  it('enviar todos só se habilita com algo enviável', () => {
    expect(hasSendableEvents([])).toBe(false)
    expect(
      hasSendableEvents(
        buildEventQueueView({
          attachmentCounts: {},
          queued: [queuedItem({ key: 'chave-1', rejectionCause: '409 CONFLICT' })],
        }),
      ),
    ).toBe(false)
    expect(
      hasSendableEvents(
        buildEventQueueView({ attachmentCounts: {}, queued: [queuedItem({ key: 'chave-2' })] }),
      ),
    ).toBe(true)
  })
})
