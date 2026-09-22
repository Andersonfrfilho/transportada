/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  jsonRequest,
  responseApiError,
  responseData,
  tripCancelPath,
  tripDispatchPath,
  tripDocumentDeliveryAddressHistoryPath,
  tripDocumentDeliveryAddressPath,
  tripDocumentLoadPath,
  tripDocumentReturnPath,
  tripDocumentSeparatePath,
  tripDocumentsBatchStatusPath,
  tripPlanRoutePath,
  tripRouteGeometryPath,
  tripStopsOrderPath,
  tripStopsPath,
  TRIP_DOCUMENT_ID,
  TRIP_ID,
} from '../fixtures/trip-http-payload.fixture'
import {
  createTripHttpFixture,
  FINANCIALS_PERMISSIONS,
  FLEET_ONLY_PERMISSIONS,
  NO_PERMISSIONS,
  READ_ONLY_PERMISSIONS,
} from '../fixtures/trip-http.fixture'
import { readTripRouteGeometry } from '../../src/trips/application/read-trip-route-geometry.use-case.js'
import { NO_FUEL_BASELINE } from '../../src/toll-booths/domain/route-option.policy.js'

/**
 * ADR-0043 §1, §2: as rotas de estado da spec 056 RF-6, testadas na fronteira HTTP — o encanamento
 * que liga a máquina pura (T006) aos use cases (T007–T010) já foi testado sozinho; este arquivo
 * cobre parsing de corpo, resolução de path parameter e a permissão de cada rota.
 */
describe('trip state routes (spec 056 T012)', () => {
  test('separates a document with an optional body, and forwards the note', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { note: 'conferido no portão' },
        method: 'POST',
        path: tripDocumentSeparatePath(),
      }),
    )

    expect(response.status).toBe(200)
    const data = await responseData(response)
    expect(data).toMatchObject({ tripStatus: 'separating' })
    expect(fixture.separateTripDocumentCalls[0]).toMatchObject({
      documentId: TRIP_DOCUMENT_ID,
      note: 'conferido no portão',
    })
  })

  test('separates a document with no body at all', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: tripDocumentSeparatePath() }),
    )

    expect(response.status).toBe(200)
    expect(fixture.separateTripDocumentCalls[0]).toMatchObject({ note: null })
  })

  test('loads a document', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: tripDocumentLoadPath() }),
    )

    expect(response.status).toBe(200)
    expect(fixture.loadTripDocumentCalls).toHaveLength(1)
  })

  /**
   * Spec 156 T8b: a rota individual `/return` saiu, pelo mesmo motivo de `/deliver` — sem autoria,
   * alcançável pelo `separator` via `trip.manage`. O caminho com autoria é `POST .../field-return`
   * (`trip-field-office.routes.ts`, `trip.report-on-behalf`).
   */
  test('the old individual return route no longer exists', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { returnReason: 'Destinatário ausente' },
        method: 'POST',
        path: tripDocumentReturnPath(),
      }),
    )

    expect(response.status).toBe(404)
  })

  test('transitions a batch of documents in one call', async () => {
    const fixture = await createTripHttpFixture()
    const documentIds = [TRIP_DOCUMENT_ID, '00000000-0000-4000-8000-000000000a20']

    const response = await fixture.handle(
      jsonRequest({
        body: { action: 'separate', documentIds },
        method: 'POST',
        path: tripDocumentsBatchStatusPath(),
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.batchStatusCalls).toEqual([
      expect.objectContaining({ action: 'separate', documentIds, note: null }),
    ])
  })

  test('refuses an empty batch', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { action: 'separate', documentIds: [] },
        method: 'POST',
        path: tripDocumentsBatchStatusPath(),
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.batchStatusCalls).toHaveLength(0)
  })

  /**
   * Spec 156 T8b: `deliver`/`return` saíram de `TRIP_DOCUMENT_ACTIONS` — o lote do escritório não
   * grava autoria, e o caminho com autoria (`field-delivery`/`field-return`) é individual, nunca
   * em massa por `trip.manage`.
   */
  test.each(['deliver', 'return'] as const)(
    'refuses a batch with the retired action %s',
    async (action) => {
      const fixture = await createTripHttpFixture()

      const response = await fixture.handle(
        jsonRequest({
          body: { action, documentIds: [TRIP_DOCUMENT_ID] },
          method: 'POST',
          path: tripDocumentsBatchStatusPath(),
        }),
      )

      expect(response.status).toBe(400)
      expect(fixture.batchStatusCalls).toHaveLength(0)
    },
  )

  test('plans the route with no body', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: tripPlanRoutePath() }),
    )

    expect(response.status).toBe(200)
    const data = await responseData(response)
    expect(data).toEqual({ tripStatus: 'route_planned' })
    expect(fixture.planTripRouteCalls).toHaveLength(1)
    expect(fixture.planTripRouteCalls[0]).not.toHaveProperty('routeChoice')
  })

  /** RF3 (spec 153 T201): o corpo é opcional, e a escolha declarada chega ao use case sem se perder. */
  test('plans the route with a routeChoice body', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { routeChoice: { criterion: 'fastest', signature: null } },
        method: 'POST',
        path: tripPlanRoutePath(),
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.planTripRouteCalls).toHaveLength(1)
    expect(fixture.planTripRouteCalls[0]).toMatchObject({
      routeChoice: { criterion: 'fastest', signature: null },
    })
  })

  test('rejects an unknown routeChoice criterion — never a silent fallback', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { routeChoice: { criterion: 'shortest', signature: null } },
        method: 'POST',
        path: tripPlanRoutePath(),
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.planTripRouteCalls).toHaveLength(0)
  })

  test('rejects a companyId in the plan-route body — it only ever comes from the authenticated context', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { companyId: '99999999-9999-4999-8999-999999999999' },
        method: 'POST',
        path: tripPlanRoutePath(),
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.planTripRouteCalls).toHaveLength(0)
  })

  test('dispatches without force by default', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(jsonRequest({ method: 'POST', path: tripDispatchPath() }))

    expect(response.status).toBe(200)
    expect(fixture.dispatchTripCalls[0]).toMatchObject({ force: false, forceReason: null })
  })

  test('dispatches forced, with a reason', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { force: true, forceReason: 'Cliente pediu para não esperar' },
        method: 'POST',
        path: tripDispatchPath(),
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.dispatchTripCalls[0]).toMatchObject({
      force: true,
      forceReason: 'Cliente pediu para não esperar',
    })
  })

  test('cancels the trip', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(jsonRequest({ method: 'POST', path: tripCancelPath() }))

    expect(response.status).toBe(200)
    expect(fixture.cancelTripCalls).toHaveLength(1)
  })

  test('lists the stops of a trip', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: tripStopsPath() }))

    expect(response.status).toBe(200)
    expect(fixture.listStopsCalls).toHaveLength(1)
  })

  test('reorders the stops of a trip', async () => {
    const fixture = await createTripHttpFixture()
    const stopIds = ['00000000-0000-4000-8000-000000000b02', '00000000-0000-4000-8000-000000000b01']

    const response = await fixture.handle(
      jsonRequest({ body: { stopIds }, method: 'PATCH', path: tripStopsOrderPath() }),
    )

    expect(response.status).toBe(200)
    const data = await responseData(response)
    expect(data).toEqual({ tripStatus: 'route_planned' })
    expect(fixture.reorderStopsCalls[0]).toMatchObject({ stopIds, tripId: TRIP_ID })
  })

  test('refuses an empty stop order', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: { stopIds: [] }, method: 'PATCH', path: tripStopsOrderPath() }),
    )

    expect(response.status).toBe(400)
    expect(fixture.reorderStopsCalls).toHaveLength(0)
  })

  test('overrides the delivery address, forwarding requester and reason', async () => {
    const fixture = await createTripHttpFixture()
    const newAddress = { cityCode: '3505500', number: '44', postalCode: '14400000' }

    const response = await fixture.handle(
      jsonRequest({
        body: {
          newAddress,
          newLabel: 'Barrinha/SP',
          reason: 'Redespacho a pedido do cliente',
          requestedBy: 'Cliente por telefone',
        },
        method: 'POST',
        path: tripDocumentDeliveryAddressPath(),
      }),
    )

    expect(response.status).toBe(201)
    const data = await responseData(response)
    expect(data).toMatchObject({
      newAddress,
      newLabel: 'Barrinha/SP',
      reason: 'Redespacho a pedido do cliente',
      requestedBy: 'Cliente por telefone',
    })
    expect(fixture.overrideDeliveryAddressCalls[0]).toMatchObject({
      documentId: TRIP_DOCUMENT_ID,
      newAddress,
      newLabel: 'Barrinha/SP',
      reason: 'Redespacho a pedido do cliente',
      requestedBy: 'Cliente por telefone',
      tripId: TRIP_ID,
    })
  })

  test('refuses a delivery address override with an empty requester', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: {
          newAddress: { cityCode: null, number: null, postalCode: null },
          newLabel: 'Barrinha/SP',
          reason: 'Redespacho',
          requestedBy: '',
        },
        method: 'POST',
        path: tripDocumentDeliveryAddressPath(),
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.overrideDeliveryAddressCalls).toHaveLength(0)
  })

  test('lists the delivery address history of a document', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: tripDocumentDeliveryAddressHistoryPath() }),
    )

    expect(response.status).toBe(200)
    expect(fixture.listDeliveryAddressHistoryCalls[0]).toMatchObject({
      documentId: TRIP_DOCUMENT_ID,
      tripId: TRIP_ID,
    })
  })

  test('surfaces the domain error code and status when a transition is refused', async () => {
    const { TripStateTransitionNotAllowedError } = await import(
      '../../src/trips/domain/trip.error.js'
    )
    const fixture = await createTripHttpFixture({
      separateTripDocumentError: new TripStateTransitionNotAllowedError('TRIP_ROUTE_NOT_PLANNED'),
    })

    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: tripDocumentSeparatePath() }),
    )

    expect(response.status).toBe(409)
    const error = await responseApiError(response)
    expect(error.code).toBe('STATE_TRANSITION_NOT_ALLOWED')
  })

  test('every state route requires trip.manage, and GET stops requires fleet.read', async () => {
    const fixture = await createTripHttpFixture({ permissions: NO_PERMISSIONS })

    const responses = await Promise.all([
      fixture.handle(jsonRequest({ method: 'POST', path: tripDocumentSeparatePath() })),
      fixture.handle(jsonRequest({ method: 'POST', path: tripDocumentLoadPath() })),
      fixture.handle(
        jsonRequest({
          body: { action: 'separate', documentIds: [TRIP_DOCUMENT_ID] },
          method: 'POST',
          path: tripDocumentsBatchStatusPath(),
        }),
      ),
      fixture.handle(jsonRequest({ method: 'POST', path: tripPlanRoutePath() })),
      fixture.handle(jsonRequest({ method: 'POST', path: tripDispatchPath() })),
      fixture.handle(jsonRequest({ method: 'POST', path: tripCancelPath() })),
      fixture.handle(jsonRequest({ method: 'GET', path: tripStopsPath() })),
      fixture.handle(
        jsonRequest({
          body: { stopIds: [TRIP_DOCUMENT_ID] },
          method: 'PATCH',
          path: tripStopsOrderPath(),
        }),
      ),
      fixture.handle(
        jsonRequest({
          body: {
            newAddress: { cityCode: null, number: null, postalCode: null },
            newLabel: 'Barrinha/SP',
            reason: 'Redespacho',
            requestedBy: 'Cliente',
          },
          method: 'POST',
          path: tripDocumentDeliveryAddressPath(),
        }),
      ),
      fixture.handle(
        jsonRequest({ method: 'GET', path: tripDocumentDeliveryAddressHistoryPath() }),
      ),
    ])

    for (const response of responses) expect(response.status).toBe(403)
    expect(fixture.separateTripDocumentCalls).toHaveLength(0)
    expect(fixture.batchStatusCalls).toHaveLength(0)
    expect(fixture.dispatchTripCalls).toHaveLength(0)
    expect(fixture.reorderStopsCalls).toHaveLength(0)
    expect(fixture.overrideDeliveryAddressCalls).toHaveLength(0)
  })

  // `fleet.manage` sozinho não é `trip.manage` (spec 055 D5) — o separador continua com o poder
  // certo, e quem cadastra frota não ganha o de mexer no estado da viagem de graça.
  test('refuses every state route to fleet.manage alone', async () => {
    const fixture = await createTripHttpFixture({ permissions: FLEET_ONLY_PERMISSIONS })

    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: tripDocumentSeparatePath() }),
    )

    expect(response.status).toBe(403)
  })
})

/**
 * Spec 153 T203: `GET /trips/:id/route-geometry` devolve a rota **congelada** quando ela existe
 * (T201), nunca recalculando ao vivo em cima de uma viagem já precificada e despachada num traçado
 * específico (D4). Sem congelamento — rascunho, OSRM fora do ar na hora de congelar (D5), ou viagem
 * anterior à spec (D8) — cai para a mesma leitura ao vivo de sempre, nunca fingindo zero.
 *
 * ⚠️ Aqui o teste liga a fixture ao caso de uso real (`readTripRouteGeometryExecute`), não a um
 * resultado enlatado: os outros contratos deste arquivo testam só o encanamento HTTP porque a
 * lógica de negócio mora noutro use case já testado à parte, mas T203 nasce sem nenhum use case
 * ainda — testar contra um objeto congelado à mão passaria mesmo antes de existir a implementação.
 */
describe('GET /trips/:id/route-geometry serves the frozen route (spec 153 T203)', () => {
  const FROZEN_ROUTE = {
    choiceReproduced: false,
    criterion: 'fastest' as const,
    depot: null,
    distanceMeters: 128_450,
    durationSeconds: 9_360,
    legs: [{ distanceMetres: 128_450, durationSeconds: 9_360 }],
    points: [
      { latitude: '-23.550520', longitude: '-46.633308' },
      { latitude: '-22.906847', longitude: '-43.172897' },
    ],
    returnDistanceMeters: 15_000,
    signature: 'frozen-signature-abc',
    toll: null,
  }

  const FROZEN_TOLL = {
    axles: { count: 2, source: 'declared' as const },
    booths: [],
    boothsFallenBackToManual: 0,
    boothsWithoutCharge: 0,
    chargePerAxle: '16.4000',
    multiplier: { denominator: 1, numerator: 2 },
    paymentMode: 'manual' as const,
    total: '32.8000',
  }

  const LIVE_ROAD_VIEW = {
    cheapestIndex: 0,
    choiceReproduced: false,
    costGap: null,
    depot: null,
    fastestIndex: 0,
    hasChoice: false,
    legs: [{ distanceMetres: 42_000, durationSeconds: 3_000 }],
    options: [
      {
        distanceMeters: 42_000,
        durationSeconds: 3_000,
        fuelTotal: null,
        isNoToll: false,
        legs: [{ distanceMetres: 42_000, durationSeconds: 3_000 }],
        points: [],
        signature: 'live-signature-xyz',
        toll: null,
        totalCost: null,
      },
    ],
    points: [],
    selectedIndex: 0,
    source: 'road' as const,
    toll: null,
  }

  const LIVE_UNAVAILABLE_VIEW = {
    cheapestIndex: null,
    choiceReproduced: false,
    costGap: null,
    depot: null,
    fastestIndex: null,
    hasChoice: false,
    legs: [],
    options: [],
    points: [],
    selectedIndex: null,
    source: 'unavailable' as const,
    toll: null,
  }

  test('is frozen: true with the stored criterion, signature, choiceReproduced and metrics', async () => {
    const fixture = await createTripHttpFixture({
      permissions: READ_ONLY_PERMISSIONS,
      readTripRouteGeometryExecute: (input) => {
        const call = input as { context: { companyId: string }; tripId: string }
        return readTripRouteGeometry({
          companyId: call.context.companyId,
          readLiveRoute: () => {
            throw new Error('não deveria calcular ao vivo com rota congelada')
          },
          route: {
            readFrozenRoute: () => Promise.resolve(FROZEN_ROUTE),
            readVehicleContext: () => Promise.resolve({ fuelBaseline: NO_FUEL_BASELINE }),
          },
          tollBooths: null,
          tripId: call.tripId,
        })
      },
    })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: tripRouteGeometryPath() }),
    )

    expect(response.status).toBe(200)
    const data = await responseData(response)
    expect(data).toMatchObject({
      choiceReproduced: false,
      criterion: 'fastest',
      distanceMeters: 128_450,
      durationSeconds: 9_360,
      frozen: true,
      hasChoice: false,
      returnDistanceMeters: 15_000,
      selectedIndex: 0,
      signature: 'frozen-signature-abc',
      source: 'road',
    })
    expect((data as { options: readonly unknown[] }).options).toHaveLength(1)
  })

  /**
   * ⚠️ Medido em staging: a rota congelada saía com combustível e custo "Não calculado" e **nenhum
   * aviso**, porque a leitura congelada fixava `fuelTotal`/`totalCost`/`costGap` em `null` sem ler o
   * veículo. A conta é a mesma da leitura ao vivo (`rankRouteOptions`), com o consumo e o preço de
   * hoje sobre o traçado de ontem.
   */
  test('computes fuel and total cost of the frozen route with the vehicle baseline', async () => {
    const fixture = await createTripHttpFixture({
      permissions: FINANCIALS_PERMISSIONS,
      readTripRouteGeometryExecute: (input) => {
        const call = input as { context: { companyId: string }; tripId: string }
        return readTripRouteGeometry({
          companyId: call.context.companyId,
          readLiveRoute: () => {
            throw new Error('não deveria calcular ao vivo com rota congelada')
          },
          route: {
            readFrozenRoute: () => Promise.resolve({ ...FROZEN_ROUTE, toll: FROZEN_TOLL }),
            readVehicleContext: () =>
              Promise.resolve({
                fuelBaseline: { kilometersPerLiter: '3.5000', pricePerLiter: '6.2000' },
              }),
          },
          tollBooths: null,
          tripId: call.tripId,
        })
      },
    })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: tripRouteGeometryPath() }),
    )

    expect(response.status).toBe(200)
    const data = await responseData(response)
    expect(data).toMatchObject({ cheapestIndex: 0, costGap: null, frozen: true })
    expect((data as { options: readonly unknown[] }).options[0]).toMatchObject({
      fuelTotal: '227.5400',
      totalCost: '260.3400',
    })
  })

  /** Sem consumo ou preço a tela precisa do **motivo** — `null` mudo não diz o que cadastrar. */
  test('says NO_FUEL_BASELINE on the frozen route when the vehicle has no consumption or price', async () => {
    const fixture = await createTripHttpFixture({
      permissions: FINANCIALS_PERMISSIONS,
      readTripRouteGeometryExecute: (input) => {
        const call = input as { context: { companyId: string }; tripId: string }
        return readTripRouteGeometry({
          companyId: call.context.companyId,
          readLiveRoute: () => {
            throw new Error('não deveria calcular ao vivo com rota congelada')
          },
          route: {
            readFrozenRoute: () => Promise.resolve({ ...FROZEN_ROUTE, toll: FROZEN_TOLL }),
            readVehicleContext: () => Promise.resolve(null),
          },
          tollBooths: null,
          tripId: call.tripId,
        })
      },
    })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: tripRouteGeometryPath() }),
    )

    expect(response.status).toBe(200)
    const data = await responseData(response)
    expect(data).toMatchObject({ cheapestIndex: null, costGap: 'NO_FUEL_BASELINE', frozen: true })
    expect((data as { options: readonly unknown[] }).options[0]).toMatchObject({
      fuelTotal: null,
      totalCost: null,
    })
  })

  test('falls back to the live route when nothing froze yet, keeping frozen: false', async () => {
    const fixture = await createTripHttpFixture({
      permissions: READ_ONLY_PERMISSIONS,
      readTripRouteGeometryExecute: (input) => {
        const call = input as { context: { companyId: string }; tripId: string }
        return readTripRouteGeometry({
          companyId: call.context.companyId,
          readLiveRoute: () => Promise.resolve(LIVE_ROAD_VIEW),
          route: {
            readFrozenRoute: () => Promise.resolve(null),
            readVehicleContext: () => {
              throw new Error('a leitura ao vivo já calcula o custo com o veículo dela')
            },
          },
          tollBooths: null,
          tripId: call.tripId,
        })
      },
    })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: tripRouteGeometryPath() }),
    )

    expect(response.status).toBe(200)
    const data = await responseData(response)
    expect(data).toMatchObject({
      criterion: null,
      distanceMeters: 42_000,
      durationSeconds: 3_000,
      frozen: false,
      signature: 'live-signature-xyz',
      source: 'road',
    })
  })

  // ADR-0044 §5: sem OSRM, ausência é `null` — nunca zero fingindo rota medida.
  test('never reports zero when the live road is unavailable — null instead', async () => {
    const fixture = await createTripHttpFixture({
      permissions: READ_ONLY_PERMISSIONS,
      readTripRouteGeometryExecute: (input) => {
        const call = input as { context: { companyId: string }; tripId: string }
        return readTripRouteGeometry({
          companyId: call.context.companyId,
          readLiveRoute: () => Promise.resolve(LIVE_UNAVAILABLE_VIEW),
          route: {
            readFrozenRoute: () => Promise.resolve(null),
            readVehicleContext: () => {
              throw new Error('a leitura ao vivo já calcula o custo com o veículo dela')
            },
          },
          tollBooths: null,
          tripId: call.tripId,
        })
      },
    })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: tripRouteGeometryPath() }),
    )

    expect(response.status).toBe(200)
    const data = await responseData(response)
    expect(data).toMatchObject({
      distanceMeters: null,
      durationSeconds: null,
      frozen: false,
      returnDistanceMeters: null,
      source: 'unavailable',
    })
  })

  test('still requires fleet.read — T203 does not widen the permission', async () => {
    const fixture = await createTripHttpFixture({ permissions: NO_PERMISSIONS })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: tripRouteGeometryPath() }),
    )

    expect(response.status).toBe(403)
  })
})
