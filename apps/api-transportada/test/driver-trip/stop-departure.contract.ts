/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 206 T2.1/T2.1a — `depart` e `cancel-departure`: a rota (corpo `.strict()`, chave extra é
 * `400`) e o caso de uso, com o dublê de `driver-field-report.port.ts`.
 */
import { describe, expect, it } from 'bun:test'

import { cancelStopDeparture } from '../../src/trips/application/cancel-stop-departure.use-case.js'
import { reportStopDeparture } from '../../src/trips/application/report-stop-departure.use-case.js'
import { createMeTripRoutes } from '../../src/trips/presentation/me-trip.routes.js'
import { parseDepartureRequest } from '../../src/trips/presentation/me-trip.schema.js'
import { ApiError } from '../../src/shared/api.error.js'
import { createFieldReportState, createFieldReportUnitOfWork } from './field-report.double.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const TRIP_ID = '00000000-0000-4000-8000-000000000004'
const STOP_ID = '00000000-0000-4000-8000-000000000005'
const OTHER_STOP_ID = '00000000-0000-4000-8000-000000000006'
const NOW = new Date('2026-09-26T13:00:00.000Z')
const TAPPED_AT = new Date('2026-09-26T12:59:00.000Z')

const NOT_CALLED = () => {
  throw new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')
}

function buildWorld(
  input: {
    readonly otherStopEnRoute?: boolean
    readonly stop?: {
      readonly arrivedAt?: Date | null
      readonly completedAt?: Date | null
      readonly enRouteSince?: Date | null
    }
  } = {},
) {
  const state = createFieldReportState()
  state.stops.set(STOP_ID, {
    arrivedAt: input.stop?.arrivedAt ?? null,
    estimatedArrivalAt: null,
    tripId: TRIP_ID,
    tripStatus: 'dispatched',
  })
  state.stops.set(OTHER_STOP_ID, {
    arrivedAt: null,
    estimatedArrivalAt: null,
    tripId: TRIP_ID,
    tripStatus: 'dispatched',
  })
  if (input.stop?.enRouteSince !== undefined) {
    state.stopEnRoute.set(STOP_ID, {
      enRouteSince: input.stop.enRouteSince,
      enRouteTappedAt: input.stop.enRouteSince,
    })
  }
  if (input.stop?.completedAt !== undefined) {
    state.stopCompletedAt.set(STOP_ID, input.stop.completedAt as Date)
  }
  if (input.otherStopEnRoute === true) {
    state.stopEnRoute.set(OTHER_STOP_ID, { enRouteSince: NOW, enRouteTappedAt: NOW })
    state.stopSequence.set(OTHER_STOP_ID, '1')
  }
  return createFieldReportUnitOfWork(state)
}

function departInput(unitOfWork: ReturnType<typeof buildWorld>, idempotencyKey: string) {
  return {
    actorUserId: ACTOR_USER_ID,
    companyId: COMPANY_ID,
    driverId: DRIVER_ID,
    idempotencyKey,
    location: null,
    now: NOW,
    stopId: STOP_ID,
    tappedAt: TAPPED_AT,
    unitOfWork,
  }
}

async function expectApiError(operation: Promise<unknown>, code: string): Promise<ApiError> {
  try {
    await operation
    throw new Error('EXPECTED_API_ERROR')
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe(code)
    return error as ApiError
  }
}

describe('depart', () => {
  it('marca a parada a caminho e leva a viagem despachada a em rota', async () => {
    const world = buildWorld()

    const result = await reportStopDeparture(departInput(world, 'chave-1'))

    expect(result.changed).toBe(true)
    expect(result.id).not.toBeNull()
    expect(world.state.calls).toContain(`markStopEnRoute:${STOP_ID}`)
    expect(world.state.calls).toContain(`markTripOnDeliveryRoute:${TRIP_ID}`)
    expect(world.state.calls).toContain('recordEvent:departed:no-gps')
  })

  it('parada de outra viagem não é alcançável', async () => {
    const world = createFieldReportUnitOfWork(createFieldReportState())

    await expectApiError(
      reportStopDeparture(departInput(world, 'chave-1')),
      'TRIP_STOP_NOT_REACHABLE',
    )
  })

  /** D2, ordem das decisões — 1) parada já a caminho: no-op, nada gravado de novo. */
  it('parada já a caminho é no-op', async () => {
    const world = buildWorld({ stop: { enRouteSince: NOW } })

    const result = await reportStopDeparture(departInput(world, 'chave-1'))

    expect(result).toEqual({ changed: false, id: null })
    expect(world.state.calls.some((call) => call.startsWith('recordEvent'))).toBe(false)
  })

  /** D2 — parada com chegada: no-op. */
  it('parada com chegada é no-op', async () => {
    const world = buildWorld({ stop: { arrivedAt: NOW } })

    const result = await reportStopDeparture(departInput(world, 'chave-1'))

    expect(result).toEqual({ changed: false, id: null })
  })

  /** D2 — parada concluída: no-op. */
  it('parada concluída é no-op', async () => {
    const world = buildWorld({ stop: { arrivedAt: NOW, completedAt: NOW } })

    const result = await reportStopDeparture(departInput(world, 'chave-1'))

    expect(result).toEqual({ changed: false, id: null })
  })

  /** D2 — `tappedAt` velho vem antes da recusa, mesmo com outra parada a caminho. */
  it('tappedAt anterior ao último departed é no-op, mesmo com outra parada a caminho', async () => {
    const world = buildWorld({ otherStopEnRoute: true })
    world.state.departedTappedAtByTripId.set(TRIP_ID, NOW)

    const result = await reportStopDeparture({
      ...departInput(world, 'chave-1'),
      tappedAt: new Date(NOW.getTime() - 10 * 60_000),
    })

    expect(result).toEqual({ changed: false, id: null })
    expect(world.state.calls.some((call) => call.startsWith('recordEvent'))).toBe(false)
  })

  /** D2/D4 — só agora, sem no-op antes, a recusa. */
  it('outra parada da viagem a caminho recusa com o contexto tipado', async () => {
    const world = buildWorld({ otherStopEnRoute: true })

    const error = await expectApiError(
      reportStopDeparture(departInput(world, 'chave-1')),
      'TRIP_HAS_STOP_EN_ROUTE',
    )

    expect(error).toMatchObject({ enRouteStopId: OTHER_STOP_ID, enRouteStopSequence: '1' })
    expect(world.state.calls.some((call) => call.startsWith('recordEvent'))).toBe(false)
    // a chave não é liquidada: a transação (do dublê, síncrona) não chegou a `settle`.
    expect(world.state.calls).not.toContain('settle')
  })

  describe('a fila offline reenvia, e o servidor não duplica', () => {
    it('o reenvio da mesma chave devolve o mesmo evento e não repete o efeito', async () => {
      const world = buildWorld()

      const first = await reportStopDeparture(departInput(world, 'chave-do-aparelho'))
      const second = await reportStopDeparture(departInput(world, 'chave-do-aparelho'))

      expect(second).toEqual(first)
      expect(world.state.calls.filter((call) => call.startsWith('recordEvent'))).toHaveLength(1)
    })

    /** D2: o no-op também liquida a chave, e o replay repete `changed: false`. */
    it('o reenvio de um no-op repete changed: false', async () => {
      const world = buildWorld({ stop: { enRouteSince: NOW } })

      const first = await reportStopDeparture(departInput(world, 'chave-no-op'))
      const second = await reportStopDeparture(departInput(world, 'chave-no-op'))

      expect(first).toEqual({ changed: false, id: null })
      expect(second).toEqual({ changed: false, id: null })
    })
  })
})

describe('cancel-departure', () => {
  it('zera a caminho da própria parada e grava departure_cancelled, sem mudar o status da viagem', async () => {
    const world = buildWorld({ stop: { enRouteSince: NOW } })

    const result = await cancelStopDeparture(departInput(world, 'chave-1'))

    expect(result.changed).toBe(true)
    expect(world.state.calls).toContain(`clearStopEnRoute:${STOP_ID}`)
    expect(world.state.calls).toContain('recordEvent:departure_cancelled:no-gps')
    expect(world.state.calls.some((call) => call.startsWith('markTripOnDeliveryRoute'))).toBe(false)
  })

  /** D18 — 1) tappedAt velho, antes de qualquer recusa. */
  it('tappedAt velho é no-op, antes da recusa de parada chegada', async () => {
    const world = buildWorld({ stop: { arrivedAt: NOW, enRouteSince: NOW } })
    world.state.arrivedAtByTripId.set(TRIP_ID, NOW)

    const result = await cancelStopDeparture({
      ...departInput(world, 'chave-1'),
      tappedAt: new Date(NOW.getTime() - 10 * 60_000),
    })

    expect(result).toEqual({ changed: false, id: null })
  })

  it('parada chegada recusa com reason arrived', async () => {
    const world = buildWorld({ stop: { arrivedAt: NOW, enRouteSince: NOW } })

    const error = await expectApiError(
      cancelStopDeparture(departInput(world, 'chave-1')),
      'TRIP_STOP_DEPARTURE_NOT_CANCELLABLE',
    )

    expect(error).toMatchObject({ reason: 'arrived' })
  })

  it('parada concluída recusa com reason completed', async () => {
    const world = buildWorld({ stop: { arrivedAt: NOW, completedAt: NOW, enRouteSince: NOW } })

    const error = await expectApiError(
      cancelStopDeparture(departInput(world, 'chave-1')),
      'TRIP_STOP_DEPARTURE_NOT_CANCELLABLE',
    )

    expect(error).toMatchObject({ reason: 'completed' })
  })

  it('parada sem "a caminho" é no-op, e o replay repete', async () => {
    const world = buildWorld()

    const first = await cancelStopDeparture(departInput(world, 'chave-1'))
    const second = await cancelStopDeparture(departInput(world, 'chave-1'))

    expect(first).toEqual({ changed: false, id: null })
    expect(second).toEqual({ changed: false, id: null })
  })

  it('cancelar libera a outra parada da viagem imediatamente', async () => {
    const world = buildWorld({ otherStopEnRoute: true })
    await cancelStopDeparture({
      ...departInput(world, 'chave-cancela'),
      stopId: OTHER_STOP_ID,
    })

    const result = await reportStopDeparture(departInput(world, 'chave-depart-outra'))

    expect(result.changed).toBe(true)
  })
})

describe('as rotas depart e cancel-departure', () => {
  const meRoutes = createMeTripRoutes({
    attachProof: NOT_CALLED,
    cancelStopDeparture: NOT_CALLED,
    confirmOccurrenceUpload: NOT_CALLED,
    createOccurrenceUpload: NOT_CALLED,
    dispatchCurrentTrip: NOT_CALLED,
    findCurrentTrip: NOT_CALLED,
    listFieldOccurrenceTypes: NOT_CALLED,
    readManifestXml: NOT_CALLED,
    registerDriverOccurrence: NOT_CALLED,
    renderManifestDamdfe: NOT_CALLED,
    reportArrival: NOT_CALLED,
    reportDelivery: NOT_CALLED,
    reportDeparture: NOT_CALLED,
    reportOccurrence: NOT_CALLED,
    reportReturn: NOT_CALLED,
    resolveDriverId: NOT_CALLED,
    startFieldTrip: NOT_CALLED,
  })

  function findRoute(suffix: string) {
    const route = meRoutes.find((candidate) => candidate.pathname.endsWith(suffix))
    if (route === undefined) throw new Error(`route not found: ${suffix}`)
    return route
  }

  function requestWithBody(body: unknown): Request {
    return new Request('http://localhost/me/trips/current/stops/x/depart', {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', 'idempotency-key': 'chave-1' },
      method: 'POST',
    })
  }

  it('existem, com trip.report e sem id de viagem', () => {
    for (const suffix of ['/depart', '/cancel-departure']) {
      const route = findRoute(suffix)
      expect(route.policy).toEqual({ permission: 'trip.report', scope: 'company' })
      expect(route.pathname).not.toContain(':tripId')
    }
  })

  for (const suffix of ['/depart', '/cancel-departure']) {
    /**
     * As duas rotas reusam `parseDepartureRequest` (o mesmo parser, D2/D18) — o teste de corpo é
     * único; o que muda por rota é só o caminho e a permissão, já cobertos acima.
     */
    it(`${suffix}: rota registrada existe`, () => {
      expect(findRoute(suffix).method).toBe('POST')
    })
  }

  it('aceita tappedAt e location, e recusa corpo ausente e chave extra com 400', async () => {
    const ok = await parseDepartureRequest(
      requestWithBody({ tappedAt: '2026-09-26T12:59:00.000Z' }),
    )
    expect(ok.tappedAt).toBeInstanceOf(Date)

    await expect(
      parseDepartureRequest(
        requestWithBody({ extraField: 'not allowed', tappedAt: '2026-09-26T12:59:00.000Z' }),
      ),
    ).rejects.toMatchObject({ status: 400 })

    await expect(parseDepartureRequest(requestWithBody({}))).rejects.toMatchObject({ status: 400 })
  })
})
