/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { isStopArrivalRecorded } from '../../src/modules/driver-trip/shared/documentActivity.service'
import { buildEventQueueView } from '../../src/modules/driver-trip/shared/eventQueueView.service'
import { toFieldReportNotice } from '../../src/modules/driver-trip/shared/fieldReportNotice.service'
import {
  drainQueueWithAttachments,
  type AttachmentSendOutcome,
} from '../../src/modules/driver-trip/shared/offlineAttachments.service'
import { enqueueReport } from '../../src/modules/driver-trip/shared/offlineQueue.service'
import { createMemoryAttachments, createMemoryQueue } from '../fixtures/memory-queue-stores.fixture'

const NOW = new Date('2026-11-05T12:00:00.000Z')
const REFUSED: AttachmentSendOutcome = { cause: '403 TRIP_NOT_DISPATCHED', kind: 'rejected' }

async function enqueueArriveThenDeliver() {
  const store = createMemoryQueue()
  await enqueueReport({
    now: NOW,
    report: { idempotencyKey: 'arrive-1', kind: 'arrive', location: null, stopId: 'stop-1' },
    store,
  })
  await enqueueReport({
    now: NOW,
    report: {
      documentId: 'doc-1',
      idempotencyKey: 'deliver-1',
      kind: 'deliver',
      lateRegistration: false,
      location: null,
    },
    store,
  })
  return store
}

/**
 * Spec 294 RNF3: o "Cheguei" recusado ou descartado não trava a baixa que vem depois — a API marca a
 * chegada junto dela, e o app mostra o aviso em vez de deixar a nota entregue sem chegada.
 */
describe('o "Cheguei" recusado na fila offline (RNF3)', () => {
  it('a baixa seguinte sobe e a API devolve a chegada marcada junto', async () => {
    const store = await enqueueArriveThenDeliver()
    const sentKinds: string[] = []
    const notices: unknown[] = []

    const result = await drainQueueWithAttachments({
      attachmentStore: createMemoryAttachments(),
      origin: 'immediate',
      send: (stamped) => {
        sentKinds.push(stamped.report.kind)
        if (stamped.report.kind === 'arrive') return Promise.resolve(REFUSED)
        notices.push(
          toFieldReportNotice({
            key: stamped.report.idempotencyKey,
            kind: stamped.report.kind,
            response: { recordedTogether: ['arrived'] },
          }),
        )
        return Promise.resolve({ kind: 'sent' })
      },
      sendAttachment: () => Promise.resolve({ kind: 'sent' }),
      store,
    })

    expect(sentKinds).toEqual(['arrive', 'deliver'])
    expect(result).toMatchObject({ rejected: 1, sent: 1 })
    expect(notices).toEqual([{ key: 'deliver-1', kind: 'deliver', recordedTogether: ['arrived'] }])
    expect(store.items().map((item) => item.report.idempotencyKey)).toEqual(['arrive-1'])
    expect(store.items()[0]?.rejectionCause).toBe('403 TRIP_NOT_DISPATCHED')
  })

  it('o item recusado não é reenviado sozinho nas drenagens seguintes', async () => {
    const store = await enqueueArriveThenDeliver()
    const send = (kind: string) => (kind === 'arrive' ? REFUSED : ({ kind: 'sent' } as const))
    const drain = () =>
      drainQueueWithAttachments({
        attachmentStore: createMemoryAttachments(),
        origin: 'immediate',
        send: (stamped) => Promise.resolve(send(stamped.report.kind)),
        sendAttachment: () => Promise.resolve({ kind: 'sent' }),
        store,
      })

    await drain()
    const second = await drain()

    expect(second).toMatchObject({ rejected: 0, sent: 0 })
  })

  it('rede caída no "Cheguei" segura a baixa: a ordem da fila não se inverte', async () => {
    const store = await enqueueArriveThenDeliver()
    const sentKinds: string[] = []

    await drainQueueWithAttachments({
      attachmentStore: createMemoryAttachments(),
      origin: 'immediate',
      send: (stamped) => {
        sentKinds.push(stamped.report.kind)
        return Promise.resolve({ kind: 'failed-network' })
      },
      sendAttachment: () => Promise.resolve({ kind: 'sent' }),
      store,
    })

    expect(sentKinds).toEqual(['arrive'])
    expect(store.items()).toHaveLength(2)
  })

  it('descartado o "Cheguei" recusado, a baixa que já estava na fila segue sem ele', async () => {
    const store = await enqueueArriveThenDeliver()
    await store.update((items) => items.filter((item) => item.report.kind !== 'arrive'))
    const sentKinds: string[] = []

    await drainQueueWithAttachments({
      attachmentStore: createMemoryAttachments(),
      origin: 'immediate',
      send: (stamped) => {
        sentKinds.push(stamped.report.kind)
        return Promise.resolve({ kind: 'sent' })
      },
      sendAttachment: () => Promise.resolve({ kind: 'sent' }),
      store,
    })

    expect(sentKinds).toEqual(['deliver'])
    expect(store.items()).toEqual([])
  })

  it('a tela segue liberando as notas com o "Cheguei" recusado ainda à vista: a API marca a chegada junto', async () => {
    const store = await enqueueArriveThenDeliver()
    await drainQueueWithAttachments({
      attachmentStore: createMemoryAttachments(),
      origin: 'immediate',
      send: (stamped) =>
        Promise.resolve(stamped.report.kind === 'arrive' ? REFUSED : { kind: 'failed-network' }),
      sendAttachment: () => Promise.resolve({ kind: 'sent' }),
      store,
    })
    const queueView = buildEventQueueView({ attachments: [], queued: store.items() })

    expect(isStopArrivalRecorded({ arrivedAt: null, queueView, stopId: 'stop-1' })).toBe(true)
  })
})
