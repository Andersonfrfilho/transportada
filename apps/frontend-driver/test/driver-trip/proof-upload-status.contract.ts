/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type { EventQueueItemView } from '@/modules/driver-trip/shared/eventQueueView.service'
import {
  INITIAL_PROOF_UPLOAD_TRACKER,
  PROOF_UNSEEN_IN_QUEUE_GRACE_MS,
  resolveProofUploadObservation,
  resolveProofUploadStatus,
  trackProofUpload,
} from '@/modules/driver-trip/shared/proofUploadStatus.service'

const NOW = '2026-09-30T09:00:00.000Z'
const LATER = '2026-09-30T09:01:00.000Z'
const DOCUMENT_ID = 'doc-1'

function queueItem(overrides: Partial<EventQueueItemView> = {}): EventQueueItemView {
  return {
    attachmentCount: 1,
    idempotencyKey: 'key-1',
    kind: 'proof',
    proofAttachments: [
      {
        attachmentKey: 'attachment-1',
        blob: new Blob(['x']),
        documentId: DOCUMENT_ID,
        kind: 'photo',
      },
    ],
    queuedAt: NOW,
    status: { state: 'queued' },
    ...overrides,
  }
}

describe('o envio do canhoto tem estado visível (defeito 2)', () => {
  it('foto ainda na fila: está enviando', () => {
    const observation = resolveProofUploadObservation({
      documentId: DOCUMENT_ID,
      kind: 'photo',
      queueView: [queueItem()],
    })
    expect(observation).toEqual({ isQueued: true, isReducing: false, isRejected: false })
  })

  it('foto de outra nota ou de outro tipo não conta', () => {
    expect(
      resolveProofUploadObservation({
        documentId: 'doc-9',
        kind: 'photo',
        queueView: [queueItem()],
      }).isQueued,
    ).toBe(false)
    expect(
      resolveProofUploadObservation({
        documentId: DOCUMENT_ID,
        kind: 'signature',
        queueView: [queueItem()],
      }).isQueued,
    ).toBe(false)
  })

  it('item recusado na fila: falhou, e continua na fila', () => {
    const observation = resolveProofUploadObservation({
      documentId: DOCUMENT_ID,
      kind: 'photo',
      queueView: [queueItem({ status: { cause: 'x', state: 'rejected' } })],
    })
    expect(observation.isRejected).toBe(true)
    expect(observation.isQueued).toBe(true)
  })

  it('sem foto: vazio', () => {
    const observation = { isAttached: false, isQueued: false, isRejected: false }
    expect(resolveProofUploadStatus({ observation, tracker: INITIAL_PROOF_UPLOAD_TRACKER })).toBe(
      'empty',
    )
  })

  it('anexada e ainda na fila: enviando', () => {
    const observation = { isAttached: true, isQueued: true, isRejected: false }
    const tracker = trackProofUpload({
      now: NOW,
      observation,
      previous: INITIAL_PROOF_UPLOAD_TRACKER,
    })
    expect(resolveProofUploadStatus({ observation, tracker })).toBe('uploading')
  })

  it('anexada, fila ainda não releu: continua enviando, nunca "enviada" por engano', () => {
    const observation = { isAttached: true, isQueued: false, isRejected: false }
    const tracker = trackProofUpload({
      now: NOW,
      observation,
      previous: INITIAL_PROOF_UPLOAD_TRACKER,
    })
    expect(resolveProofUploadStatus({ observation, tracker })).toBe('uploading')
    expect(tracker.sentAt).toBeUndefined()
  })

  it('saiu da fila depois de estar nela: enviada, com a hora da confirmação', () => {
    const queued = { isAttached: true, isQueued: true, isRejected: false }
    const sent = { isAttached: true, isQueued: false, isRejected: false }
    const first = trackProofUpload({
      now: NOW,
      observation: queued,
      previous: INITIAL_PROOF_UPLOAD_TRACKER,
    })
    const tracker = trackProofUpload({ now: LATER, observation: sent, previous: first })
    expect(resolveProofUploadStatus({ observation: sent, tracker })).toBe('sent')
    expect(tracker.sentAt).toBe(LATER)
  })

  it('a hora da confirmação não anda nos renders seguintes', () => {
    const sent = { isAttached: true, isQueued: false, isRejected: false }
    const queued = { isAttached: true, isQueued: true, isRejected: false }
    const first = trackProofUpload({
      now: NOW,
      observation: queued,
      previous: INITIAL_PROOF_UPLOAD_TRACKER,
    })
    const confirmed = trackProofUpload({ now: LATER, observation: sent, previous: first })
    const again = trackProofUpload({
      now: '2026-09-30T10:00:00.000Z',
      observation: sent,
      previous: confirmed,
    })
    expect(again).toBe(confirmed)
  })

  it('recusada: falhou, e o indicador de envio sai', () => {
    const observation = { isAttached: true, isQueued: true, isRejected: true }
    const tracker = trackProofUpload({
      now: NOW,
      observation,
      previous: INITIAL_PROOF_UPLOAD_TRACKER,
    })
    expect(resolveProofUploadStatus({ observation, tracker })).toBe('failed')
  })

  it('substituir depois de enviada volta a enviando, sem a hora antiga', () => {
    const queued = { isAttached: true, isQueued: true, isRejected: false }
    const sent = { isAttached: true, isQueued: false, isRejected: false }
    const first = trackProofUpload({
      now: NOW,
      observation: queued,
      previous: INITIAL_PROOF_UPLOAD_TRACKER,
    })
    const confirmed = trackProofUpload({ now: LATER, observation: sent, previous: first })
    const replaced = trackProofUpload({ now: LATER, observation: queued, previous: confirmed })
    expect(resolveProofUploadStatus({ observation: queued, tracker: replaced })).toBe('uploading')
    expect(replaced.sentAt).toBeUndefined()
  })

  it('removida: o rastro some', () => {
    const queued = { isAttached: true, isQueued: true, isRejected: false }
    const removed = { isAttached: false, isQueued: false, isRejected: false }
    const first = trackProofUpload({
      now: NOW,
      observation: queued,
      previous: INITIAL_PROOF_UPLOAD_TRACKER,
    })
    expect(trackProofUpload({ now: LATER, observation: removed, previous: first })).toEqual(
      INITIAL_PROOF_UPLOAD_TRACKER,
    )
  })

  it('fila vazia, nunca vista na fila e o servidor já tem a foto: enviada, não "enviando"', () => {
    const observation = {
      isAttached: true,
      isConfirmedByServer: true,
      isQueued: false,
      isRejected: false,
    }
    expect(resolveProofUploadStatus({ observation, tracker: INITIAL_PROOF_UPLOAD_TRACKER })).toBe(
      'sent',
    )
  })

  it('fila vazia sem confirmação do servidor continua enviando', () => {
    const observation = {
      isAttached: true,
      isConfirmedByServer: false,
      isQueued: false,
      isRejected: false,
    }
    expect(resolveProofUploadStatus({ observation, tracker: INITIAL_PROOF_UPLOAD_TRACKER })).toBe(
      'uploading',
    )
  })

  it('foto na fila ainda reduzindo: avisa que está reduzindo, sem travar', () => {
    const observation = resolveProofUploadObservation({
      documentId: DOCUMENT_ID,
      kind: 'photo',
      queueView: [
        queueItem({
          proofAttachments: [
            {
              attachmentKey: 'attachment-1',
              blob: new Blob(['x']),
              documentId: DOCUMENT_ID,
              isReducing: true,
              kind: 'photo',
            },
          ],
        }),
      ],
    })
    expect(observation.isReducing).toBe(true)
    expect(
      resolveProofUploadStatus({
        observation: { isAttached: true, ...observation },
        tracker: INITIAL_PROOF_UPLOAD_TRACKER,
      }),
    ).toBe('reducing')
  })

  it('fila vazia e nunca vista nela, passada a folga: enviada, não "enviando" para sempre (14/10)', () => {
    const observation = { isAttached: true, isQueued: false, isRejected: false }
    const first = trackProofUpload({
      now: NOW,
      observation,
      previous: INITIAL_PROOF_UPLOAD_TRACKER,
    })
    expect(resolveProofUploadStatus({ observation, tracker: first })).toBe('uploading')
    const afterGrace = new Date(Date.parse(NOW) + PROOF_UNSEEN_IN_QUEUE_GRACE_MS).toISOString()
    const tracker = trackProofUpload({ now: afterGrace, observation, previous: first })
    expect(resolveProofUploadStatus({ observation, tracker })).toBe('sent')
    expect(tracker.sentAt).toBe(afterGrace)
  })

  it('a folga não vence se o anexo aparece na fila no meio', () => {
    const unseen = { isAttached: true, isQueued: false, isRejected: false }
    const queued = { isAttached: true, isQueued: true, isRejected: false }
    const first = trackProofUpload({
      now: NOW,
      observation: unseen,
      previous: INITIAL_PROOF_UPLOAD_TRACKER,
    })
    const tracker = trackProofUpload({ now: LATER, observation: queued, previous: first })
    expect(resolveProofUploadStatus({ observation: queued, tracker })).toBe('uploading')
    expect(tracker.sentAt).toBeUndefined()
  })
})
