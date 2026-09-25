/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  buildEventQueueView,
  hasSendableEvents,
} from '@/modules/driver-trip/shared/eventQueueView.service'
import type { QueuedAttachment } from '@/modules/driver-trip/shared/offlineAttachments.service'
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

function attachment(input: {
  readonly key?: string
  readonly rejectionCause?: string
}): QueuedAttachment {
  return {
    attachmentKey: input.key ?? 'anexo-1',
    blob: new Blob([new Uint8Array(4)], { type: 'image/jpeg' }),
    capturedAt: NOW,
    documentId: 'document-1',
    fileName: 'canhoto.jpg',
    kind: 'photo',
    ...(input.rejectionCause === undefined ? {} : { rejectionCause: input.rejectionCause }),
  }
}

describe('a tela de eventos pendentes (D7)', () => {
  it('deriva tipo, hora e contagem de anexos de cada item da fila', () => {
    const views = buildEventQueueView({
      attachments: [['chave-1', [attachment({}), attachment({ key: 'anexo-2' })]]],
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
      attachments: [],
      queued: [queuedItem({ attempts: 3, key: 'chave-1' })],
    })

    expect(views[0]?.status).toEqual({ attempts: 3, state: 'failed' })
  })

  /** A causa gravada na recusa chega inteira à tela — status + código, nunca um genérico. */
  it('item rejeitado carrega a causa legível, e a rejeição vence a contagem de tentativas', () => {
    const views = buildEventQueueView({
      attachments: [],
      queued: [queuedItem({ attempts: 2, key: 'chave-1', rejectionCause: '409 CONFLICT' })],
    })

    expect(views[0]?.status).toEqual({ cause: '409 CONFLICT', state: 'rejected' })
  })

  /**
   * Revisão 082 (4d): o grupo de anexos cujo evento **já subiu** aparece como item próprio
   * (`proof`) — o evento aceito permanece aceito, e o problema à vista é do anexo.
   */
  it('anexos órfãos de evento já aceito viram item proof, com a causa do anexo', () => {
    const views = buildEventQueueView({
      attachments: [
        ['chave-1', [attachment({ rejectionCause: '413 PROOF_FILE_TOO_LARGE' })]],
        ['chave-2', [attachment({ key: 'anexo-2' })]],
      ],
      queued: [],
    })

    expect(views).toEqual([
      {
        attachmentCount: 1,
        attachmentRejectionCause: '413 PROOF_FILE_TOO_LARGE',
        idempotencyKey: 'chave-1',
        kind: 'proof',
        queuedAt: NOW,
        status: { cause: '413 PROOF_FILE_TOO_LARGE', state: 'rejected' },
      },
      {
        attachmentCount: 1,
        idempotencyKey: 'chave-2',
        kind: 'proof',
        queuedAt: NOW,
        status: { state: 'queued' },
      },
    ])
  })

  it('anexo rejeitado de evento ainda na fila aparece como causa do anexo, sem mudar o evento', () => {
    const views = buildEventQueueView({
      attachments: [['chave-1', [attachment({ rejectionCause: '413 PROOF_FILE_TOO_LARGE' })]]],
      queued: [queuedItem({ key: 'chave-1' })],
    })

    expect(views[0]?.status).toEqual({ state: 'queued' })
    expect(views[0]?.attachmentRejectionCause).toBe('413 PROOF_FILE_TOO_LARGE')
  })

  it('enviar todos só se habilita com algo enviável', () => {
    expect(hasSendableEvents([])).toBe(false)
    expect(
      hasSendableEvents(
        buildEventQueueView({
          attachments: [],
          queued: [queuedItem({ key: 'chave-1', rejectionCause: '409 CONFLICT' })],
        }),
      ),
    ).toBe(false)
    expect(
      hasSendableEvents(
        buildEventQueueView({ attachments: [], queued: [queuedItem({ key: 'chave-2' })] }),
      ),
    ).toBe(true)
  })
})
