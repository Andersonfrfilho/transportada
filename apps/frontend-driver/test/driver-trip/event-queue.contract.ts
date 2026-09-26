/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type { DriverTripStop } from '@/modules/driver-trip/shared/driverTrip.types'
import {
  buildEventQueueView,
  hasSendableEvents,
  resolveEventQueueDepartBlock,
  resolveEventQueueStopSequence,
  type EventQueueItemView,
} from '@/modules/driver-trip/shared/eventQueueView.service'
import type { QueuedAttachment } from '@/modules/driver-trip/shared/offlineAttachments.service'
import type { QueuedReport } from '@/modules/driver-trip/shared/offlineQueue.service'

function stop(input: { readonly id: string; readonly sequence: number }): DriverTripStop {
  return {
    arrivedAt: null,
    completedAt: null,
    deliveryProof: null,
    deliveryWindowEnd: null,
    deliveryWindowStart: null,
    documents: [],
    enRouteSince: null,
    enRouteTappedAt: null,
    id: input.id,
    label: 'Parada',
    latitude: null,
    longitude: null,
    schedule: null,
    sequence: input.sequence,
  }
}

function departItem(input: {
  readonly cause?: string
  readonly details?: readonly { readonly field: string; readonly message: string }[]
  readonly stopId: string
}): EventQueueItemView {
  return {
    attachmentCount: 0,
    idempotencyKey: 'key-depart',
    kind: 'depart',
    queuedAt: NOW,
    stopId: input.stopId,
    status:
      input.cause === undefined
        ? { state: 'queued' }
        : {
            cause: input.cause,
            ...(input.details === undefined ? {} : { details: input.details }),
            state: 'rejected',
          },
  }
}

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

function arriveItem(input: { readonly key: string; readonly stopId: string }): QueuedReport {
  return {
    attempts: 0,
    createdAt: NOW,
    report: { idempotencyKey: input.key, kind: 'arrive', location: null, stopId: input.stopId },
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
        /** Spec 206: `deliver`/`return` também carregam `documentId` — é o que `resolveEnRouteStopId` lê (D9). */
        documentId: 'document-1',
        idempotencyKey: 'chave-1',
        kind: 'deliver',
        queuedAt: NOW,
        status: { state: 'queued' },
      },
      {
        attachmentCount: 0,
        documentId: 'document-1',
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
        /* Spec 207: o grupo órfão leva o documentId do anexo — "Remover" precisa saber de qual nota é. */
        documentId: 'document-1',
        idempotencyKey: 'chave-1',
        kind: 'proof',
        queuedAt: NOW,
        status: { cause: '413 PROOF_FILE_TOO_LARGE', state: 'rejected' },
      },
      {
        attachmentCount: 1,
        documentId: 'document-1',
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

  /** Pedido do usuário (25/09): "Cheguei" libera a entrega — a tela precisa do `stopId` do evento. */
  it('item de chegada ("arrive") carrega o `stopId` — os outros tipos não', () => {
    const views = buildEventQueueView({
      attachments: [],
      queued: [arriveItem({ key: 'chave-1', stopId: 'stop-9' }), queuedItem({ key: 'chave-2' })],
    })

    expect(views[0]?.stopId).toBe('stop-9')
    expect(views[1]).not.toHaveProperty('stopId')
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

/**
 * Spec 206 RF8: o rótulo do `depart` carrega o número da parada do snapshot — sem número quando
 * ela saiu (viagem trocada, cartão sumido).
 */
describe('o número da parada no item de fila (RF8)', () => {
  it('devolve o `sequence` da parada do item', () => {
    const item = departItem({ stopId: 'stop-2' })
    const stops = [stop({ id: 'stop-1', sequence: 1 }), stop({ id: 'stop-2', sequence: 2 })]

    expect(resolveEventQueueStopSequence({ item, stops })).toBe(2)
  })

  it('sem a parada no snapshot, devolve `undefined`', () => {
    const item = departItem({ stopId: 'stop-9' })
    const stops = [stop({ id: 'stop-1', sequence: 1 })]

    expect(resolveEventQueueStopSequence({ item, stops })).toBeUndefined()
  })

  it('item sem `stopId` (não é depart/arrive/cancelDeparture) devolve `undefined`', () => {
    const view = buildEventQueueView({
      attachments: [],
      queued: [queuedItem({ key: 'chave-1' })],
    })[0]
    expect(view).toBeDefined()
    if (view === undefined) return

    expect(resolveEventQueueStopSequence({ item: view, stops: [] })).toBeUndefined()
  })
})

/**
 * Spec 206 RF8b: o `depart` recusado por `409 TRIP_HAS_STOP_EN_ROUTE` não pode sumir calado — a
 * tela precisa do motivo e do atalho até a parada que está a caminho AGORA.
 */
describe('o depart recusado por outra parada a caminho (RF8b)', () => {
  const stops = [stop({ id: 'stop-1', sequence: 1 }), stop({ id: 'stop-2', sequence: 2 })]

  it('devolve a parada bloqueante quando a recusa é TRIP_HAS_STOP_EN_ROUTE', () => {
    const item = departItem({ cause: '409 TRIP_HAS_STOP_EN_ROUTE', stopId: 'stop-2' })

    expect(resolveEventQueueDepartBlock({ enRouteStopId: 'stop-1', item, stops })).toEqual({
      blockingStopId: 'stop-1',
      blockingStopSequence: 1,
    })
  })

  it('outra causa de recusa não vira bloqueio — cai no texto genérico', () => {
    const item = departItem({ cause: '404 TRIP_STOP_NOT_REACHABLE', stopId: 'stop-2' })

    expect(resolveEventQueueDepartBlock({ enRouteStopId: 'stop-1', item, stops })).toBeUndefined()
  })

  it('sem parada a caminho agora (já fechou), o bloqueio não aparece mais', () => {
    const item = departItem({ cause: '409 TRIP_HAS_STOP_EN_ROUTE', stopId: 'stop-2' })

    expect(resolveEventQueueDepartBlock({ enRouteStopId: undefined, item, stops })).toBeUndefined()
  })

  it('item ainda na fila (não recusado) não é bloqueio', () => {
    const item = departItem({ stopId: 'stop-2' })

    expect(resolveEventQueueDepartBlock({ enRouteStopId: 'stop-1', item, stops })).toBeUndefined()
  })

  it('item de outro tipo (não depart) nunca é bloqueio, mesmo com a mesma causa', () => {
    const item = queuedItem({ key: 'chave-1', rejectionCause: '409 TRIP_HAS_STOP_EN_ROUTE' })
    const view = buildEventQueueView({ attachments: [], queued: [item] })[0]
    expect(view).toBeDefined()
    if (view === undefined) return

    expect(
      resolveEventQueueDepartBlock({ enRouteStopId: 'stop-1', item: view, stops }),
    ).toBeUndefined()
  })
})

/**
 * Spec 206 D9: "o 409 existe para o que a tela não viu: outro aparelho e o item de fila antigo."
 * Nesse caso `resolveEnRouteStopId` local não tem como saber qual parada bloqueou — só o
 * `error.details` da resposta sabia, no instante da recusa. Casos extremos da spec.md:922/937-939.
 */
describe('o bloqueio vindo de error.details, quando a tela não viu (D9)', () => {
  const stops = [stop({ id: 'stop-1', sequence: 1 }), stop({ id: 'stop-2', sequence: 2 })]

  it('sem enRouteStopId local (outro aparelho), usa o blockingStopId do details', () => {
    const item = departItem({
      cause: '409 TRIP_HAS_STOP_EN_ROUTE',
      details: [
        { field: 'enRouteStopId', message: 'stop-1' },
        { field: 'enRouteStopSequence', message: '1' },
      ],
      stopId: 'stop-2',
    })

    expect(resolveEventQueueDepartBlock({ enRouteStopId: undefined, item, stops })).toEqual({
      blockingStopId: 'stop-1',
      blockingStopSequence: 1,
    })
  })

  it('a sequência vem do snapshot atual, mais fresca que a do details, quando a parada ainda existe', () => {
    const renumbered = [stop({ id: 'stop-1', sequence: 3 }), stop({ id: 'stop-2', sequence: 2 })]
    const item = departItem({
      cause: '409 TRIP_HAS_STOP_EN_ROUTE',
      details: [
        { field: 'enRouteStopId', message: 'stop-1' },
        { field: 'enRouteStopSequence', message: '1' },
      ],
      stopId: 'stop-2',
    })

    expect(
      resolveEventQueueDepartBlock({ enRouteStopId: undefined, item, stops: renumbered }),
    ).toEqual({ blockingStopId: 'stop-1', blockingStopSequence: 3 })
  })

  it('parada bloqueante sumiu do snapshot: cai na sequência que o details mandou', () => {
    const item = departItem({
      cause: '409 TRIP_HAS_STOP_EN_ROUTE',
      details: [
        { field: 'enRouteStopId', message: 'stop-9' },
        { field: 'enRouteStopSequence', message: '5' },
      ],
      stopId: 'stop-2',
    })

    expect(resolveEventQueueDepartBlock({ enRouteStopId: undefined, item, stops })).toEqual({
      blockingStopId: 'stop-9',
      blockingStopSequence: 5,
    })
  })

  it('details tem prioridade sobre o cálculo local quando os dois existem', () => {
    const item = departItem({
      cause: '409 TRIP_HAS_STOP_EN_ROUTE',
      details: [
        { field: 'enRouteStopId', message: 'stop-1' },
        { field: 'enRouteStopSequence', message: '1' },
      ],
      stopId: 'stop-2',
    })

    // enRouteStopId local aponta para outra coisa (não deveria acontecer na prática, mas o
    // details — a verdade do servidor no instante da recusa — vence).
    expect(resolveEventQueueDepartBlock({ enRouteStopId: 'stop-1', item, stops })).toEqual({
      blockingStopId: 'stop-1',
      blockingStopSequence: 1,
    })
  })

  it('details sem os dois campos esperados não quebra — cai no cálculo local', () => {
    const item = departItem({
      cause: '409 TRIP_HAS_STOP_EN_ROUTE',
      details: [{ field: 'unrelatedField', message: 'x' }],
      stopId: 'stop-2',
    })

    expect(resolveEventQueueDepartBlock({ enRouteStopId: 'stop-1', item, stops })).toEqual({
      blockingStopId: 'stop-1',
      blockingStopSequence: 1,
    })
  })
})
