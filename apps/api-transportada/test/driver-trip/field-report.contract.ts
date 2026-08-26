/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  reportDocumentDelivery,
  reportDocumentReturn,
} from '../../src/trips/application/report-document-delivery.use-case.js'
import { reportStopArrival } from '../../src/trips/application/report-stop-arrival.use-case.js'
import { reportStopOccurrence } from '../../src/trips/application/report-stop-occurrence.use-case.js'
import type { TripDocumentSeparationStatus, TripStatus } from '../../src/database/trip.schema.js'
import { ApiError } from '../../src/shared/api.error.js'
import { createFieldReportState, createFieldReportUnitOfWork } from './field-report.double.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const TRIP_ID = '00000000-0000-4000-8000-000000000004'
const STOP_ID = '00000000-0000-4000-8000-000000000005'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000006'
const NOW = new Date('2026-08-26T13:00:00.000Z')

const LOCATION = {
  accuracyMeters: '12.50',
  capturedAt: '2026-08-26T12:59:58.000Z',
  latitude: '-23.5505199',
  longitude: '-46.6333094',
} as const

function buildArrivalWorld(
  input: { readonly arrivedAt?: Date; readonly tripStatus?: string } = {},
) {
  const state = createFieldReportState()
  state.stops.set(STOP_ID, {
    arrivedAt: input.arrivedAt ?? null,
    tripId: TRIP_ID,
    tripStatus: input.tripStatus ?? 'dispatched',
  })
  return createFieldReportUnitOfWork(state)
}

function buildDocumentWorld(
  input: {
    readonly separationStatus?: TripDocumentSeparationStatus
    readonly stopId?: string | null
    readonly tripStatus?: TripStatus
  } = {},
) {
  const world = buildArrivalWorld({ arrivedAt: NOW, tripStatus: 'in_transit' })
  world.state.documents.set(DOCUMENT_ID, {
    separationStatus: input.separationStatus ?? 'loaded',
    stopId: input.stopId === undefined ? STOP_ID : input.stopId,
    tripId: TRIP_ID,
    tripStatus: input.tripStatus ?? 'in_transit',
  })
  return world
}

function arrivalInput(unitOfWork: ReturnType<typeof buildArrivalWorld>, idempotencyKey: string) {
  return {
    actorUserId: ACTOR_USER_ID,
    companyId: COMPANY_ID,
    driverId: DRIVER_ID,
    idempotencyKey,
    location: null,
    now: NOW,
    stopId: STOP_ID,
    unitOfWork,
  }
}

function deliveryInput(unitOfWork: ReturnType<typeof buildDocumentWorld>, idempotencyKey: string) {
  return {
    actorUserId: ACTOR_USER_ID,
    companyId: COMPANY_ID,
    documentId: DOCUMENT_ID,
    driverId: DRIVER_ID,
    idempotencyKey,
    location: null,
    now: NOW,
    unitOfWork,
  }
}

async function expectApiError(operation: Promise<unknown>, code: string): Promise<void> {
  try {
    await operation
    throw new Error('EXPECTED_API_ERROR')
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe(code)
  }
}

describe('cheguei', () => {
  it('grava a chegada e leva a viagem despachada a em trânsito', async () => {
    const world = buildArrivalWorld()

    await reportStopArrival(arrivalInput(world, 'chave-1'))

    expect(world.state.calls).toContain(`markStopArrived:${STOP_ID}`)
    expect(world.state.calls).toContain(`markTripInTransit:${TRIP_ID}`)
    expect(world.state.calls).toContain('recordEvent:arrived:no-gps')
  })

  /** A recusa de GPS não bloqueia (ADR-0045 §3.1) — e o evento entra sem coordenada nenhuma. */
  it('aceita a chegada sem posição, que é o caso do galpão sem sinal', async () => {
    const world = buildArrivalWorld()

    const result = await reportStopArrival(arrivalInput(world, 'chave-1'))

    expect(result.id).toStartWith('event-')
    expect(world.state.calls).toContain('recordEvent:arrived:no-gps')
  })

  it('carimba a posição quando o aparelho conseguiu ler', async () => {
    const world = buildArrivalWorld()

    await reportStopArrival({ ...arrivalInput(world, 'chave-1'), location: LOCATION })

    expect(world.state.calls).toContain('recordEvent:arrived:gps')
  })

  /** Chegar de novo não reescreve a hora: a primeira é a que aconteceu. */
  it('não reescreve a chegada já gravada', async () => {
    const world = buildArrivalWorld({ arrivedAt: new Date('2026-08-26T11:00:00.000Z') })

    await reportStopArrival(arrivalInput(world, 'chave-1'))

    expect(world.state.calls).not.toContain(`markStopArrived:${STOP_ID}`)
  })

  it('viagem que já está em trânsito não é promovida de novo', async () => {
    const world = buildArrivalWorld({ tripStatus: 'in_transit' })

    await reportStopArrival(arrivalInput(world, 'chave-1'))

    expect(world.state.calls).not.toContain(`markTripInTransit:${TRIP_ID}`)
  })

  it('parada que não é de uma viagem ativa deste motorista não é alcançável', async () => {
    const world = createFieldReportUnitOfWork(createFieldReportState())

    await expectApiError(
      reportStopArrival(arrivalInput(world, 'chave-1')),
      'TRIP_STOP_NOT_REACHABLE',
    )
  })
})

describe('a fila offline reenvia, e o servidor não duplica', () => {
  /**
   * É a garantia inteira do modo offline: três confirmações na fila, rede voltando, e o reenvio
   * devolvendo o mesmo evento em vez de carimbar uma coordenada nova sobre a entrega de vinte
   * minutos atrás.
   */
  it('o reenvio da mesma chave devolve o mesmo evento e não repete o efeito', async () => {
    const world = buildArrivalWorld()

    const first = await reportStopArrival(arrivalInput(world, 'chave-do-aparelho'))
    const callsAfterFirst = [...world.state.calls]
    const second = await reportStopArrival(arrivalInput(world, 'chave-do-aparelho'))

    expect(second.id).toBe(first.id)
    expect(world.state.calls.filter((call) => call.startsWith('recordEvent'))).toHaveLength(1)
    expect(callsAfterFirst).toContain(`markStopArrived:${STOP_ID}`)
  })

  /** A mesma chave em ações diferentes é erro do cliente, não repetição. */
  it('a mesma chave numa ação diferente é recusada com código estável', async () => {
    const world = buildDocumentWorld()

    await reportStopArrival(arrivalInput(world, 'chave-repetida'))
    await expectApiError(
      reportDocumentDelivery(deliveryInput(world, 'chave-repetida')),
      'TRIP_FIELD_REPORT_KEY_REUSED',
    )
  })
})

describe('entreguei e não entreguei', () => {
  it('entrega a nota e fecha a parada e a viagem quando foi a última', async () => {
    const world = buildDocumentWorld()
    world.state.stopCompletes = true
    world.state.tripCompletes = true

    const result = await reportDocumentDelivery(deliveryInput(world, 'chave-1'))

    expect(world.state.calls).toContain(`markDocumentDelivered:${DOCUMENT_ID}`)
    expect(result.stopCompleted).toBe(true)
    expect(result.tripCompleted).toBe(true)
  })

  /** A viagem só fecha depois da parada: a última parada é que leva a viagem a `completed`. */
  it('não fecha a viagem enquanto a parada não fechou', async () => {
    const world = buildDocumentWorld()
    world.state.stopCompletes = false
    world.state.tripCompletes = true

    const result = await reportDocumentDelivery(deliveryInput(world, 'chave-1'))

    expect(result).toMatchObject({ stopCompleted: false, tripCompleted: false })
  })

  it('a não-entrega grava o motivo da lista fechada', async () => {
    const world = buildDocumentWorld()

    await reportDocumentReturn({
      ...deliveryInput(world, 'chave-1'),
      reason: 'establishment_closed',
    })

    expect(world.state.calls).toContain(`markDocumentReturned:${DOCUMENT_ID}:establishment_closed`)
    expect(world.state.calls).toContain('recordEvent:returned:no-gps')
  })

  /**
   * O caso que a spec nomeia: a confirmação estava na fila e o escritório desvinculou a nota. A tela
   * mostra o conflito — sumir com o toque do motorista é pior do que recusá-lo com o motivo.
   */
  it('nota que o escritório desvinculou é recusada com código estável', async () => {
    const world = buildDocumentWorld({ stopId: null })

    await expectApiError(
      reportDocumentDelivery(deliveryInput(world, 'chave-1')),
      'TRIP_DOCUMENT_NOT_REACHABLE',
    )
  })

  /**
   * A 056 já decidiu isto e escreveu o porquê: a fila offline drena muito depois do toque, e uma
   * entrega que **funcionou** voltaria como 409 para o motorista que fez tudo certo. Reconfirmar
   * nota já entregue é no-op anunciado, nunca conflito.
   */
  it('nota já entregue volta como resolvida, não como conflito', async () => {
    const world = buildDocumentWorld({ separationStatus: 'delivered' })

    const result = await reportDocumentDelivery(deliveryInput(world, 'chave-nova'))

    expect(result.alreadySettled).toBe(true)
    expect(world.state.calls).not.toContain(`markDocumentDelivered:${DOCUMENT_ID}`)
  })

  /** Viagem cancelada com o motorista na rua: a confirmação é recusada com o motivo, não engolida. */
  it('viagem cancelada recusa a confirmação com o estado como motivo', async () => {
    const world = buildDocumentWorld({ tripStatus: 'cancelled' })

    await expectApiError(
      reportDocumentDelivery(deliveryInput(world, 'chave-1')),
      'STATE_TRANSITION_NOT_ALLOWED',
    )
  })

  /** Nota que nem foi carregada não se entrega: o portão de origem da 056 continua valendo na rua. */
  it('nota não carregada é recusada com o motivo da política', async () => {
    const world = buildDocumentWorld({ separationStatus: 'pending' })

    await expectApiError(
      reportDocumentDelivery(deliveryInput(world, 'chave-1')),
      'STATE_TRANSITION_NOT_ALLOWED',
    )
  })
})

describe('deu problema', () => {
  function occurrenceInput(world: ReturnType<typeof buildDocumentWorld>, key: string) {
    return {
      actorUserId: ACTOR_USER_ID,
      attachmentObjectId: null,
      companyId: COMPANY_ID,
      description: 'Duas horas na fila da doca',
      documentId: null,
      driverId: DRIVER_ID,
      idempotencyKey: key,
      kind: 'long_wait' as const,
      stopId: STOP_ID,
      unitOfWork: world,
    }
  }

  it('registra a ocorrência sem pedir valor nenhum ao motorista', async () => {
    const world = buildDocumentWorld()

    const result = await reportStopOccurrence(occurrenceInput(world, 'chave-1'))

    expect(result.id).toStartWith('occurrence-')
    expect(world.state.calls).toContain('recordOccurrence:long_wait')
  })

  /**
   * D6.2: ele esperou duas horas **e** entregou. Forçar a ocorrência a ser motivo de não-entrega
   * perderia o caso mais comum, e é o erro que este teste impede de voltar.
   */
  it('a ocorrência não impede a entrega da mesma nota logo depois', async () => {
    const world = buildDocumentWorld()

    await reportStopOccurrence({
      ...occurrenceInput(world, 'chave-ocorrencia'),
      documentId: DOCUMENT_ID,
    })
    const delivery = await reportDocumentDelivery(deliveryInput(world, 'chave-entrega'))

    expect(delivery.id).toStartWith('event-')
    expect(world.state.calls).toContain(`markDocumentDelivered:${DOCUMENT_ID}`)
  })

  it('a ocorrência não muda o estado de nota nenhuma', async () => {
    const world = buildDocumentWorld()

    await reportStopOccurrence({
      ...occurrenceInput(world, 'chave-1'),
      documentId: DOCUMENT_ID,
    })

    expect(world.state.calls.some((call) => call.startsWith('markDocument'))).toBe(false)
  })

  it('parada de outra viagem não recebe ocorrência', async () => {
    const world = createFieldReportUnitOfWork(createFieldReportState())

    await expectApiError(
      reportStopOccurrence(occurrenceInput(world, 'chave-1')),
      'TRIP_STOP_NOT_REACHABLE',
    )
  })
})
