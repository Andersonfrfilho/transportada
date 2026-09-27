/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T5: as rotas do escritório resolvem o alvo pela empresa do contexto (nunca pelo
 * motorista logado), chamam os mesmos casos de uso da T3 com `{ target }` e gravam `audit_logs`.
 * O comportamento das portas (404, 422, o motorista escolhido) já está provado em
 * `field-trip-target.contract.test.ts` (T3) — aqui a prova é a FIAÇÃO: caminho, permissão,
 * parâmetros passados adiante e o envelope de resposta.
 */
import { describe, expect, it } from 'bun:test'

import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import {
  createClientIpResolver,
  DEFAULT_CLIENT_IP_POLICY,
} from '../../src/http/client-ip.service.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { ApiError } from '../../src/shared/api.error.js'
import type { FieldTripCrew } from '../../src/trips/application/field-trip-target.port.js'
import { TripNotFoundError } from '../../src/trips/domain/trip.error.js'
import {
  createTripFieldOfficeRoutes,
  type TripFieldOfficeDependencies,
} from '../../src/trips/presentation/trip-field-office.routes.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000002'
const TRIP_ID = '00000000-0000-4000-8000-000000000004'
const STOP_ID = '00000000-0000-4000-8000-000000000005'
const FIRST_DRIVER = '00000000-0000-4000-8000-0000000000a1'
const SECOND_DRIVER = '00000000-0000-4000-8000-0000000000a2'
const OUTSIDER = '00000000-0000-4000-8000-0000000000a9'

function context(): AuthenticatedContext<CompanyContext> {
  return {
    identity: {} as AuthenticatedIdentity,
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000000103',
      permissions: new Set(['trip.report-on-behalf'] as never),
      roles: ['operator'],
      userId: ACTOR_USER_ID,
    },
  }
}

function jsonRequest(input: { readonly body?: object; readonly idempotencyKey?: string }): Request {
  const headers: Record<string, string> = {}
  if (input.body !== undefined) headers['content-type'] = 'application/json'
  if (input.idempotencyKey !== undefined) headers['idempotency-key'] = input.idempotencyKey
  return new Request('http://localhost/trips/x', {
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    headers,
    method: 'POST',
  })
}

function buildTargetsDouble(crew: FieldTripCrew | null) {
  const calls: unknown[] = []
  return {
    calls,
    findTripCrew: async (input: { readonly companyId: string; readonly tripId: string }) => {
      calls.push(input)
      return crew
    },
  }
}

const TWO_DRIVERS: FieldTripCrew = {
  drivers: [
    { driverId: FIRST_DRIVER, position: 1 },
    { driverId: SECOND_DRIVER, position: 2 },
  ],
  tripId: TRIP_ID,
  tripStatus: 'in_transit',
}

const NOT_CALLED = () => {
  throw new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')
}

async function expectApiError(
  operation: Promise<unknown>,
  code: string,
  status: number,
): Promise<void> {
  try {
    await operation
    throw new Error('EXPECTED_API_ERROR')
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe(code)
    expect((error as ApiError).status).toBe(status)
  }
}

describe('confirm-load e start-route do escritório (spec 156 T5)', () => {
  it('resolve o alvo pela empresa do contexto e pede a trilha (audit_logs) ao caso de uso com o motorista de position 1', async () => {
    const targets = buildTargetsDouble(TWO_DRIVERS)
    const startCalls: unknown[] = []
    const dependencies: TripFieldOfficeDependencies = {
      reportArrival: NOT_CALLED,
      reportOccurrence: NOT_CALLED,
      attachProof: NOT_CALLED,
      reportDelivery: NOT_CALLED,
      reportReturn: NOT_CALLED,
      resolveClientIp: createClientIpResolver(DEFAULT_CLIENT_IP_POLICY),
      startFieldTrip: async (input) => {
        startCalls.push(input)
        return { changed: true, tripId: TRIP_ID, tripStatus: 'on_delivery_route' }
      },
      targets,
    }
    const [confirmLoadRoute] = createTripFieldOfficeRoutes(dependencies)

    const response = await confirmLoadRoute!.execute({
      context: context(),
      correlationId: 'correlation-1',
      pathParameters: { id: TRIP_ID },
      request: jsonRequest({}),
    })

    expect(targets.calls).toEqual([{ companyId: COMPANY_ID, tripId: TRIP_ID }])
    expect(startCalls).toEqual([
      {
        officeAudit: {
          action: 'trip_field_office.confirm_load',
          correlationId: 'correlation-1',
          ipAddress: 'unknown',
        },
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        step: 'confirmLoad',
        target: {
          kind: 'trip',
          onBehalfOfDriverId: FIRST_DRIVER,
          tripId: TRIP_ID,
          tripStatus: 'in_transit',
        },
      },
    ])
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: { changed: true, status: 'on_delivery_route' },
    })
  })

  it('aceite 13: o driverId escolhido no corpo vai para o alvo', async () => {
    const targets = buildTargetsDouble(TWO_DRIVERS)
    const startCalls: unknown[] = []
    const [, startRouteRoute] = createTripFieldOfficeRoutes({
      reportArrival: NOT_CALLED,
      reportOccurrence: NOT_CALLED,
      attachProof: NOT_CALLED,
      reportDelivery: NOT_CALLED,
      reportReturn: NOT_CALLED,
      resolveClientIp: createClientIpResolver(DEFAULT_CLIENT_IP_POLICY),
      startFieldTrip: async (input) => {
        startCalls.push(input)
        return { changed: true, tripId: TRIP_ID, tripStatus: 'on_delivery_route' }
      },
      targets,
    })

    await startRouteRoute!.execute({
      context: context(),
      correlationId: 'correlation-2',
      pathParameters: { id: TRIP_ID },
      request: jsonRequest({ body: { driverId: SECOND_DRIVER } }),
    })

    expect(
      (startCalls[0] as { target: { onBehalfOfDriverId: string } }).target.onBehalfOfDriverId,
    ).toBe(SECOND_DRIVER)
  })

  it('aceite 3: viagem de outra empresa ou inexistente responde 404 TRIP_NOT_FOUND, nunca 403', async () => {
    const [confirmLoadRoute] = createTripFieldOfficeRoutes({
      reportArrival: NOT_CALLED,
      reportOccurrence: NOT_CALLED,
      attachProof: NOT_CALLED,
      reportDelivery: NOT_CALLED,
      reportReturn: NOT_CALLED,
      resolveClientIp: createClientIpResolver(DEFAULT_CLIENT_IP_POLICY),
      startFieldTrip: NOT_CALLED,
      targets: buildTargetsDouble(null),
    })

    await expectApiError(
      confirmLoadRoute!.execute({
        context: context(),
        correlationId: 'correlation-3',
        pathParameters: { id: TRIP_ID },
        request: jsonRequest({}),
      }),
      new TripNotFoundError().code,
      404,
    )
  })

  it('id de viagem malformado responde 400, nunca 500', async () => {
    const [confirmLoadRoute] = createTripFieldOfficeRoutes({
      reportArrival: NOT_CALLED,
      reportOccurrence: NOT_CALLED,
      attachProof: NOT_CALLED,
      reportDelivery: NOT_CALLED,
      reportReturn: NOT_CALLED,
      resolveClientIp: createClientIpResolver(DEFAULT_CLIENT_IP_POLICY),
      startFieldTrip: NOT_CALLED,
      targets: { findTripCrew: NOT_CALLED },
    })

    await expectApiError(
      confirmLoadRoute!.execute({
        context: context(),
        correlationId: 'correlation-4',
        pathParameters: { id: 'not-a-uuid' },
        request: jsonRequest({}),
      }),
      'INVALID_REQUEST',
      400,
    )
  })
})

describe('a chegada do escritório (spec 156 T5)', () => {
  it('exige idempotency-key, resolve o alvo e pede a trilha (audit_logs) ao caso de uso', async () => {
    const targets = buildTargetsDouble(TWO_DRIVERS)
    const arrivalCalls: unknown[] = []
    const [, , arriveRoute] = createTripFieldOfficeRoutes({
      reportArrival: async (input) => {
        arrivalCalls.push(input)
        return { id: 'event-1' }
      },
      reportOccurrence: NOT_CALLED,
      attachProof: NOT_CALLED,
      reportDelivery: NOT_CALLED,
      reportReturn: NOT_CALLED,
      resolveClientIp: createClientIpResolver(DEFAULT_CLIENT_IP_POLICY),
      startFieldTrip: NOT_CALLED,
      targets,
    })

    const response = await arriveRoute!.execute({
      context: context(),
      correlationId: 'correlation-5',
      pathParameters: { id: TRIP_ID, stopId: STOP_ID },
      request: jsonRequest({ idempotencyKey: 'office-arrive-1' }),
    })

    expect(arrivalCalls).toEqual([
      {
        officeAudit: {
          action: 'trip_field_office.stop_arrive',
          correlationId: 'correlation-5',
          ipAddress: 'unknown',
        },
        actorUserId: ACTOR_USER_ID,
        arrivedAt: expect.any(Date),
        companyId: COMPANY_ID,
        idempotencyKey: 'office-arrive-1',
        stopId: STOP_ID,
        target: {
          kind: 'trip',
          onBehalfOfDriverId: FIRST_DRIVER,
          tripId: TRIP_ID,
          tripStatus: 'in_transit',
        },
      },
    ])
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ data: { id: 'event-1' } })
  })

  it('sem idempotency-key responde 400, antes de resolver o alvo', async () => {
    const targets = buildTargetsDouble(TWO_DRIVERS)
    const [, , arriveRoute] = createTripFieldOfficeRoutes({
      reportArrival: NOT_CALLED,
      reportOccurrence: NOT_CALLED,
      attachProof: NOT_CALLED,
      reportDelivery: NOT_CALLED,
      reportReturn: NOT_CALLED,
      resolveClientIp: createClientIpResolver(DEFAULT_CLIENT_IP_POLICY),
      startFieldTrip: NOT_CALLED,
      targets,
    })

    await expectApiError(
      arriveRoute!.execute({
        context: context(),
        correlationId: 'correlation-6',
        pathParameters: { id: TRIP_ID, stopId: STOP_ID },
        request: jsonRequest({}),
      }),
      'INVALID_REQUEST',
      400,
    )
    expect(targets.calls).toEqual([])
  })
})

describe('a ocorrência de parada do escritório (spec 156 T5)', () => {
  it('mesmo payload da rota do motorista, mais o driverId, e pede a trilha (audit_logs) ao caso de uso', async () => {
    const targets = buildTargetsDouble(TWO_DRIVERS)
    const occurrenceCalls: unknown[] = []
    const [, , , occurrenceRoute] = createTripFieldOfficeRoutes({
      reportArrival: NOT_CALLED,
      reportOccurrence: async (input) => {
        occurrenceCalls.push(input)
        return { id: 'occurrence-1' }
      },
      attachProof: NOT_CALLED,
      reportDelivery: NOT_CALLED,
      reportReturn: NOT_CALLED,
      resolveClientIp: createClientIpResolver(DEFAULT_CLIENT_IP_POLICY),
      startFieldTrip: NOT_CALLED,
      targets,
    })

    const response = await occurrenceRoute!.execute({
      context: context(),
      correlationId: 'correlation-7',
      pathParameters: { id: TRIP_ID, stopId: STOP_ID },
      request: jsonRequest({
        body: { description: 'Doca fechada', driverId: SECOND_DRIVER, kind: 'long_wait' },
        idempotencyKey: 'office-occurrence-1',
      }),
    })

    expect(occurrenceCalls).toEqual([
      {
        officeAudit: {
          action: 'trip_field_office.stop_occurrence',
          correlationId: 'correlation-7',
          ipAddress: 'unknown',
        },
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        description: 'Doca fechada',
        distanceMeters: null,
        documentId: null,
        idempotencyKey: 'office-occurrence-1',
        kind: 'long_wait',
        stopId: STOP_ID,
        target: {
          kind: 'trip',
          onBehalfOfDriverId: SECOND_DRIVER,
          tripId: TRIP_ID,
          tripStatus: 'in_transit',
        },
      },
    ])
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ data: { id: 'occurrence-1' } })
  })

  it('aceite 13: driverId fora da tripulação responde 422 DRIVER_NOT_ON_TRIP', async () => {
    const [, , , occurrenceRoute] = createTripFieldOfficeRoutes({
      reportArrival: NOT_CALLED,
      reportOccurrence: NOT_CALLED,
      attachProof: NOT_CALLED,
      reportDelivery: NOT_CALLED,
      reportReturn: NOT_CALLED,
      resolveClientIp: createClientIpResolver(DEFAULT_CLIENT_IP_POLICY),
      startFieldTrip: NOT_CALLED,
      targets: buildTargetsDouble(TWO_DRIVERS),
    })

    await expectApiError(
      occurrenceRoute!.execute({
        context: context(),
        correlationId: 'correlation-8',
        pathParameters: { id: TRIP_ID, stopId: STOP_ID },
        request: jsonRequest({
          body: { driverId: OUTSIDER, kind: 'long_wait' },
          idempotencyKey: 'office-occurrence-2',
        }),
      }),
      'DRIVER_NOT_ON_TRIP',
      422,
    )
  })
})
