/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 249 T1.5: o caso de uso da transferência de tripulação na rua. A checagem de janela aqui é só
 * UX; quem decide de verdade é o repositório, sob lock (provado contra Postgres em
 * `test/integration/trip-crew-transfer.integration.ts`).
 */
import { describe, expect, test } from 'bun:test'

import type {
  TransferTripCrewParams,
  TransferTripCrewResult,
} from '../../src/trips/application/trip-crew-transfer.types.js'
import type { TripDetail, TripRepositoryPort } from '../../src/trips/application/trip.port.js'
import { createTripUseCase } from '../../src/trips/application/trip.use-case.js'
import type { ApiError } from '../../src/shared/api.error.js'
import {
  TripCrewUnchangedError,
  TripStateTransitionNotAllowedError,
} from '../../src/trips/domain/trip.error.js'
import type { TripDriverCandidate } from '../../src/trips/domain/trip.policy.js'
import type { TripStatus } from '../../src/database/trip.schema.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const TRIP_ID = '44444444-4444-4444-8444-444444444444'
const VEHICLE_ID = '44444444-4444-4444-8444-444444444441'
const ANA_ID = '44444444-4444-4444-8444-444444444442'
const BRUNO_ID = '44444444-4444-4444-8444-444444444443'
const CARLA_ID = '44444444-4444-4444-8444-444444444444'
const DIOGO_ID = '44444444-4444-4444-8444-444444444445'

const CONTEXT = { companyId: COMPANY_ID, userId: USER_ID }
const CORRELATION_ID = 'correlation-crew-transfer'
const IP_ADDRESS = '203.0.113.10'
const REASON = 'Motorista passou mal na estrada'

function candidate(overrides: Partial<TripDriverCandidate> & { id: string }): TripDriverCandidate {
  return {
    canActAsHelper: false,
    canDrive: true,
    name: `Pessoa ${overrides.id.slice(-2)}`,
    status: 'active',
    taxId: '12345678909',
    ...overrides,
  }
}

const FLEET: readonly TripDriverCandidate[] = [
  candidate({ id: ANA_ID, name: 'Ana Souza' }),
  candidate({ id: BRUNO_ID, name: 'Bruno Lima' }),
  candidate({ canActAsHelper: true, id: CARLA_ID, name: 'Carla Dias' }),
  candidate({ canActAsHelper: true, canDrive: false, id: DIOGO_ID, name: 'Diogo Ajudante' }),
]

function tripIn(status: TripStatus): TripDetail {
  return { id: TRIP_ID, status, vehicleId: VEHICLE_ID } as unknown as TripDetail
}

const TRANSFER_RESULT = {
  transfer: {
    costAfter: '1350.00',
    costBefore: '1200.00',
    costDifference: '150.00',
    costHasGaps: false,
    id: '55555555-5555-4555-8555-555555555555',
    mdfeDriverDivergence: true,
  },
  trip: tripIn('in_transit'),
} satisfies TransferTripCrewResult

function createFixture(
  params: { readonly stored?: TripDetail | null; readonly repositoryError?: Error } = {},
) {
  const transferCalls: TransferTripCrewParams[] = []
  const findVehicleCalls: unknown[] = []
  const stored = params.stored === undefined ? tripIn('in_transit') : params.stored

  const repository = {
    async findById() {
      return stored
    },
    async findVehicle(input: unknown) {
      findVehicleCalls.push(input)
      return null
    },
    async listDrivers() {
      return FLEET
    },
    async transferCrew(input: TransferTripCrewParams) {
      transferCalls.push(input)
      if (params.repositoryError !== undefined) throw params.repositoryError
      return stored === null ? null : TRANSFER_RESULT
    },
  } as unknown as TripRepositoryPort

  const useCase = createTripUseCase({
    locations: { async purgeByTrip() {} },
    repository,
  })
  return { findVehicleCalls, transferCalls, useCase }
}

function request(overrides: { driverIds?: readonly string[]; helperIds?: readonly string[] } = {}) {
  return {
    context: CONTEXT,
    correlationId: CORRELATION_ID,
    driverIds: overrides.driverIds ?? [BRUNO_ID],
    helperIds: overrides.helperIds ?? [],
    ipAddress: IP_ADDRESS,
    reason: REASON,
    tripId: TRIP_ID,
  }
}

describe('transferir a tripulação de uma viagem na rua (spec 249)', () => {
  test.each(['dispatched', 'in_transit', 'on_delivery_route'] as const)(
    'libera a transferência com a viagem em %s e devolve o resumo do repositório',
    async (status) => {
      const fixture = createFixture({ stored: tripIn(status) })

      const result = await fixture.useCase.transferCrew(request())

      expect(result).toEqual(TRANSFER_RESULT)
      expect(fixture.transferCalls).toHaveLength(1)
    },
  )

  test('entrega ao repositório a tripulação resolvida, o ator, o canal, a trilha e o motivo — sem veículo', async () => {
    const fixture = createFixture()

    await fixture.useCase.transferCrew(request({ driverIds: [BRUNO_ID], helperIds: [CARLA_ID] }))

    expect(fixture.transferCalls).toEqual([
      {
        actorUserId: USER_ID,
        channel: 'backoffice',
        companyId: COMPANY_ID,
        correlationId: CORRELATION_ID,
        crew: [
          {
            driverId: BRUNO_ID,
            driverName: 'Bruno Lima',
            driverTaxId: '12345678909',
            position: 1,
            role: 'driver',
          },
          {
            driverId: CARLA_ID,
            driverName: 'Carla Dias',
            driverTaxId: '12345678909',
            position: 2,
            role: 'helper',
          },
        ],
        ipAddress: IP_ADDRESS,
        reason: REASON,
        tripId: TRIP_ID,
      },
    ])
    expect(Object.keys(fixture.transferCalls[0] ?? {})).not.toContain('vehicleId')
    expect(fixture.findVehicleCalls).toEqual([])
  })

  test('o ajudante que dirige assume como motorista na posição 1', async () => {
    const fixture = createFixture()

    await fixture.useCase.transferCrew(request({ driverIds: [CARLA_ID], helperIds: [] }))

    expect(fixture.transferCalls[0]?.crew).toEqual([
      expect.objectContaining({ driverId: CARLA_ID, position: 1, role: 'driver' }),
    ])
  })

  test.each([
    ['cancelled', 'TRIP_CANCELLED'],
    ['completed', 'TRIP_COMPLETED'],
    ['awaiting_crew', 'TRIP_NOT_DISPATCHED'],
    ['draft', 'TRIP_NOT_DISPATCHED'],
    ['route_planned', 'TRIP_NOT_DISPATCHED'],
    ['separating', 'TRIP_NOT_DISPATCHED'],
    ['loading', 'TRIP_NOT_DISPATCHED'],
  ] as const)('recusa com a viagem em %s (%s) sem tocar no repositório', async (status, reason) => {
    const fixture = createFixture({ stored: tripIn(status) })

    const error = await fixture.useCase.transferCrew(request()).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TripStateTransitionNotAllowedError)
    expect((error as ApiError).status).toBe(409)
    expect((error as ApiError).code).toBe('STATE_TRANSITION_NOT_ALLOWED')
    expect((error as TripStateTransitionNotAllowedError).reason).toBe(reason)
    expect(fixture.transferCalls).toEqual([])
  })

  test('viagem de outra empresa ou inexistente: 404 antes de qualquer outra coisa', async () => {
    const fixture = createFixture({ stored: null })

    const error = await fixture.useCase.transferCrew(request()).catch((caught: unknown) => caught)

    expect((error as ApiError).code).toBe('TRIP_NOT_FOUND')
    expect((error as ApiError).status).toBe(404)
    expect(fixture.transferCalls).toEqual([])
  })

  test('a viagem some entre a leitura e o lock: o repositório devolve null e vira 404', async () => {
    const racing = createTripUseCase({
      locations: { async purgeByTrip() {} },
      repository: {
        async findById() {
          return tripIn('in_transit')
        },
        async listDrivers() {
          return FLEET
        },
        async transferCrew() {
          return null
        },
      } as unknown as TripRepositoryPort,
    })

    const error = await racing.transferCrew(request()).catch((caught: unknown) => caught)

    expect((error as ApiError).code).toBe('TRIP_NOT_FOUND')
  })

  test.each([
    [
      'ficha inativa',
      [candidate({ id: BRUNO_ID, status: 'inactive' })],
      'TRIP_DRIVER_NOT_AVAILABLE',
      422,
    ],
    ['ficha inexistente', [], 'TRIP_DRIVER_NOT_FOUND', 404],
  ] as const)(
    'recusa %s com o erro da criação, sem gravar',
    async (_label, drivers, code, status) => {
      const repository = {
        async findById() {
          return tripIn('in_transit')
        },
        async listDrivers() {
          return drivers
        },
        async transferCrew() {
          throw new Error('NEVER_REACHED')
        },
      } as unknown as TripRepositoryPort
      const useCase = createTripUseCase({ locations: { async purgeByTrip() {} }, repository })

      const error = await useCase.transferCrew(request()).catch((caught: unknown) => caught)

      expect((error as ApiError).code).toBe(code)
      expect((error as ApiError).status).toBe(status)
    },
  )

  test('quem não dirige não entra como motorista; quem não ajuda não entra como ajudante', async () => {
    const fixture = createFixture()

    const cannotDrive = await fixture.useCase
      .transferCrew(request({ driverIds: [DIOGO_ID] }))
      .catch((caught: unknown) => caught)
    const cannotHelp = await fixture.useCase
      .transferCrew(request({ driverIds: [ANA_ID], helperIds: [BRUNO_ID] }))
      .catch((caught: unknown) => caught)

    expect((cannotDrive as ApiError).code).toBe('TRIP_DRIVER_CANNOT_DRIVE')
    expect((cannotHelp as ApiError).code).toBe('TRIP_CREW_HELPER_NOT_ELIGIBLE')
    expect(fixture.transferCalls).toEqual([])
  })

  test('a mesma pessoa em dois lugares é recusada', async () => {
    const fixture = createFixture()

    const error = await fixture.useCase
      .transferCrew(request({ driverIds: [CARLA_ID], helperIds: [CARLA_ID] }))
      .catch((caught: unknown) => caught)

    expect((error as ApiError).code).toBe('TRIP_DRIVER_DUPLICATED')
    expect(fixture.transferCalls).toEqual([])
  })

  test('o repositório decide a tripulação inalterada, e o caso de uso não engole a recusa', async () => {
    const fixture = createFixture({ repositoryError: new TripCrewUnchangedError() })

    const error = await fixture.useCase.transferCrew(request()).catch((caught: unknown) => caught)

    expect((error as ApiError).code).toBe('TRIP_CREW_UNCHANGED')
    expect((error as ApiError).status).toBe(409)
  })
})
