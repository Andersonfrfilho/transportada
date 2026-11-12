/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import driverTripEn from '../../src/modules/driver-trip/locales/driverTrip.en.locale.json'
import driverTrip from '../../src/modules/driver-trip/locales/driverTrip.locale.json'
import type { DriverFieldReport } from '../../src/modules/driver-trip/shared/driverTrip.types'
import {
  createDriverTripClient,
  reportBody,
  toAttachmentSendOutcome,
} from '../../src/modules/driver-trip/shared/driverTripClient.service'
import { buildEventQueueView } from '../../src/modules/driver-trip/shared/eventQueueView.service'
import { enqueueReport } from '../../src/modules/driver-trip/shared/offlineQueue.service'
import {
  markOutOfOrderConfirmed,
  resolveOutOfOrderPrompt,
} from '../../src/modules/driver-trip/shared/outOfOrderPrompt.service'
import { createMemoryQueue } from '../fixtures/memory-queue-stores.fixture'

const NOW = new Date('2026-11-05T12:00:00.000Z')
const TAPPED_AT = '2026-11-05T12:00:00.000Z'
const VIOLATION = {
  currentSequence: 3,
  currentStopId: 'stop-3',
  nextSequence: 3,
  nextStopId: 'stop-3',
  requestedSequence: 5,
  requestedStopId: 'stop-5',
}
const OUT_OF_ORDER_CAUSE = '409 TRIP_STOP_OUT_OF_ORDER'

const REPORTS = [
  { idempotencyKey: 'k-arrive', kind: 'arrive', location: null, stopId: 'stop-5' },
  {
    idempotencyKey: 'k-depart',
    kind: 'depart',
    location: null,
    stopId: 'stop-5',
    tappedAt: TAPPED_AT,
  },
  {
    documentId: 'doc-1',
    idempotencyKey: 'k-deliver',
    kind: 'deliver',
    lateRegistration: false,
    location: null,
  },
  {
    documentId: 'doc-1',
    idempotencyKey: 'k-return',
    kind: 'return',
    lateRegistration: false,
    location: null,
    reason: 'recipient_refused',
  },
] as const satisfies readonly DriverFieldReport[]

function outOfOrderClient() {
  return createDriverTripClient({
    apiUrl: 'https://api.test',
    fetch: () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: { code: 'TRIP_STOP_OUT_OF_ORDER', correlationId: 'c1', message: 'out of order' },
            outOfOrder: VIOLATION,
          }),
          { headers: { 'content-type': 'application/json' }, status: 409 },
        ),
      ),
    getAccessToken: () => Promise.resolve('token'),
  })
}

async function rejectedQueue(report: DriverFieldReport) {
  const store = createMemoryQueue()
  await enqueueReport({ now: NOW, report, store })
  await store.update((items) =>
    items.map((item) => ({
      ...item,
      rejectionCause: OUT_OF_ORDER_CAUSE,
      rejectionDetails: Object.entries(VIOLATION).map(([field, message]) => ({
        field,
        message: String(message),
      })),
    })),
  )
  return store
}

/** Spec 294 RF27: a API recusa o toque fora da ordem; o app pergunta e só reenvia com a confirmação. */
describe('o 409 de fora de ordem chega ao app (RF27)', () => {
  it('o cliente lança com a violação em details e a fila a guarda como recusa', async () => {
    let caught: unknown
    try {
      await outOfOrderClient().send({ report: REPORTS[0], stamp: undefined })
    } catch (error) {
      caught = error
    }

    expect(caught).toMatchObject({ code: 'TRIP_STOP_OUT_OF_ORDER', status: 409 })
    const outcome = toAttachmentSendOutcome(caught)
    expect(outcome).toMatchObject({ cause: OUT_OF_ORDER_CAUSE, kind: 'rejected' })
    expect(outcome.kind === 'rejected' ? outcome.details : []).toContainEqual({
      field: 'requestedSequence',
      message: '5',
    })
  })

  it.each(REPORTS.map((report) => [report.kind, report] as const))(
    'o corpo do %s só leva confirmOutOfOrder quando o motorista confirmou',
    (_kind, report) => {
      expect(JSON.parse(reportBody({ report, stamp: undefined }))).not.toHaveProperty(
        'confirmOutOfOrder',
      )
      expect(
        JSON.parse(
          reportBody({
            report: { ...report, confirmOutOfOrder: true },
            stamp: undefined,
          }),
        ),
      ).toMatchObject({ confirmOutOfOrder: true })
    },
  )
})

describe('o diálogo de fora de ordem (RF25/RF27)', () => {
  it.each(REPORTS.map((report) => [report.kind, report] as const))(
    'o %s recusado vira o pedido de confirmação, com as paradas',
    async (_kind, report) => {
      const store = await rejectedQueue(report)
      const queueView = buildEventQueueView({ attachments: [], queued: store.items() })

      expect(resolveOutOfOrderPrompt(queueView)).toEqual({
        currentSequence: 3,
        idempotencyKey: report.idempotencyKey,
        kind: report.kind,
        nextSequence: 3,
        requestedSequence: 5,
      })
    },
  )

  it('outra recusa, ou um item que não é da rota, não abre o diálogo', async () => {
    const store = await rejectedQueue(REPORTS[0])
    await store.update((items) =>
      items.map((item) => ({ ...item, rejectionCause: '409 TRIP_HAS_STOP_EN_ROUTE' })),
    )
    expect(
      resolveOutOfOrderPrompt(buildEventQueueView({ attachments: [], queued: store.items() })),
    ).toBeUndefined()
  })

  it('"Registrar mesmo assim" volta o item à fila com a confirmação e sem a recusa', async () => {
    const store = await rejectedQueue(REPORTS[2])
    await enqueueReport({ now: NOW, report: REPORTS[0], store })

    await store.update((items) => markOutOfOrderConfirmed(items, 'k-deliver'))

    const [confirmed, untouched] = store.items()
    expect(confirmed?.report).toMatchObject({ confirmOutOfOrder: true, kind: 'deliver' })
    expect(confirmed?.rejectionCause).toBeUndefined()
    expect(confirmed?.rejectionDetails).toBeUndefined()
    expect(untouched?.report).not.toHaveProperty('confirmOutOfOrder')
    expect(
      resolveOutOfOrderPrompt(buildEventQueueView({ attachments: [], queued: store.items() })),
    ).toBeUndefined()
  })

  it('os textos existem nos dois idiomas', () => {
    for (const locale of [driverTrip, driverTripEn]) {
      expect(Object.keys(locale.outOfOrder).sort()).toEqual([
        'confirm',
        'discard',
        'generic',
        'kind',
        'title',
        'withCurrent',
        'withNext',
      ])
      expect(Object.keys(locale.outOfOrder.kind).sort()).toEqual([
        'arrive',
        'deliver',
        'depart',
        'return',
      ])
    }
  })
})

/**
 * Pedido do dono (06/11): a ordem da rota é sugestão — o motorista segue se achar melhor. A pergunta
 * é um modal em cobre (a cor de aviso do app), que abre na hora e não diz que o escritório recusou.
 */
describe('o aviso de fora de ordem é sugestão, num modal (06/11)', () => {
  const read = (path: string): Promise<string> =>
    Bun.file(new URL(`../../${path}`, import.meta.url)).text()

  it('os textos falam em rota sugerida e deixam seguir, sem "recusou" nem "mesmo assim"', () => {
    const texts = [
      driverTrip.outOfOrder.title,
      driverTrip.outOfOrder.withNext,
      driverTrip.outOfOrder.withCurrent,
      driverTrip.outOfOrder.generic,
      driverTrip.outOfOrder.confirm,
    ].join(' ')
    expect(driverTrip.outOfOrder.withNext).toContain('sugerida')
    expect(texts).not.toMatch(/recus|mesmo assim|Quer mesmo/i)
  })

  it('é modal (foco preso, por cima da tela) em cobre, nunca a faixa vermelha de recusa', async () => {
    const component = await read(
      'src/modules/driver-trip/components/DriverOutOfOrderDialog.component.tsx',
    )
    expect(component).toContain('useModalDialog')
    expect(component).toContain('aria-modal="true"')
    expect(component).toContain('styles.outOfOrderModal')
    expect(component).not.toContain('rejectedBanner')
    const css = await read('src/modules/driver-trip/styles/driverTrip.module.css')
    const backdrop = css.slice(css.indexOf('.outOfOrderBackdrop {'))
    expect(backdrop.slice(0, backdrop.indexOf('}'))).toContain('position: fixed')
    const modal = css.slice(css.indexOf('.outOfOrderModal {'))
    expect(modal.slice(0, modal.indexOf('}'))).toContain('--color-copper')
  })
})
