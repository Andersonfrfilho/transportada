/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createTripComposer } from '../../src/routing/infrastructure/trip-composer.adapter.js'
import type { MultiVehicleScope } from '../../src/routing/application/multi-vehicle-suggestion.port.js'
import { createTripUseCase } from '../../src/trips/application/trip.use-case.js'
import type { TripDetail, TripRepositoryPort } from '../../src/trips/application/trip.port.js'
import { resolveCrewStatus } from '../../src/trips/domain/trip-state.policy.js'
import type {
  TripDriverCandidate,
  TripVehicleCandidate,
} from '../../src/trips/domain/trip.policy.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333'
const DRIVER_ID = '44444444-4444-4444-8444-444444444444'
const TRIP_ID = '55555555-5555-4555-8555-555555555555'

const CONTEXT: MultiVehicleScope = {
  companyId: COMPANY_ID,
  kind: 'company',
  membershipId: '66666666-6666-4666-8666-666666666666',
  permissions: new Set(['trip.manage']),
  roles: ['operator'],
  userId: USER_ID,
}

const VEHICLE: TripVehicleCandidate = {
  defaultTrailerVehicleId: null,
  id: VEHICLE_ID,
  role: 'traction',
  status: 'active',
  vehicleType: 'tractor_unit',
}
const DRIVER: TripDriverCandidate = {
  canActAsHelper: false,
  id: DRIVER_ID,
  name: 'Ana Souza',
  status: 'active',
  taxId: '12345678909',
}

function openTrip(overrides: Partial<TripDetail> = {}): TripDetail {
  return {
    amounts: null,
    cargoLayout: null,
    cargoLayoutState: {
      computedAt: null,
      errorCode: null,
      stale: false,
      status: 'unavailable',
      truncated: false,
    },
    capacityUnknownReason: null,
    capacityUnknownVehicleId: null,
    cargoWeight: null,
    closeReason: null,
    closedAt: null,
    closedByName: null,
    companyId: COMPANY_ID,
    createdAt: '2026-08-01T10:00:00.000Z',
    documents: [],
    driverNames: [],
    drivers: [],
    id: TRIP_ID,
    occupancy: null,
    trailer: null,
    requiresMdfe: null,
    requiresMdfeReason: null,
    status: 'draft',
    stops: [],
    updatedAt: '2026-08-01T10:00:00.000Z',
    vehicleId: null,
    ...overrides,
  }
}

/**
 * Spec 217 T203 — regressão da 081: a sugestão multi-veículo pareia veículo com motorista **opcional**
 * (081 RF-5: "legítimo: metade da frota escalada, metade não"), e `createTripComposer` traduz
 * `driverId: null` em `driverIds: []` desde então. A 217 muda o que esse `driverIds: []` produz — o
 * status deixa de ser `draft` fixo e passa a ser o par (`resolveCrewStatus`, D1) — mas não muda a
 * tradução em si: o adaptador continua chamando `dependencies.create` com `driverIds: []` de
 * qualquer jeito, e a viagem continua nascendo.
 *
 * ⚠️ Achado durante esta task: o passo seguinte do aceite (`planRoute`, sempre chamado depois de
 * criar+vincular+reordenar) passa a recusar com `TRIP_CREW_NOT_DEFINED` quando o par fica incompleto
 * — provado à parte contra Postgres em `test/integration/multi-vehicle-suggestion.integration.ts`,
 * que ficou vermelho com esta mudança. Fora do escopo da Fase 2 (mexe em `checkTripTransition`,
 * Fase 3, ou no fluxo de aceite da sugestão) — registrado em evidence.md para a Fase 3 decidir.
 */
describe('trip composer adapter creates the trip from a suggestion pair (spec 217 T203, regressão 081)', () => {
  function buildComposer(params: { readonly vehicle?: TripVehicleCandidate | null } = {}) {
    const repository: TripRepositoryPort = {
      async close() {
        throw new Error('not used by this contract')
      },
      async create(input) {
        return openTrip({
          drivers: input.crew.map((member) => ({ ...member, driverEmail: '', driverPhone: '' })),
          status: resolveCrewStatus({
            hasDriver: input.crew.length > 0,
            hasVehicle: input.vehicleId !== null,
          }),
          vehicleId: input.vehicleId,
        })
      },
      async findById() {
        return openTrip()
      },
      async findDocumentById() {
        return null
      },
      async findLiveTripIdForDocuments() {
        throw new Error('not used by this contract')
      },
      async findVehicle() {
        return params.vehicle === undefined ? VEHICLE : params.vehicle
      },
      async isTrailerInOpenTrip() {
        return false
      },
      async linkDocument() {
        throw new Error('not used by this contract')
      },
      async list() {
        return { items: [], nextCursor: null }
      },
      async listDrivers() {
        return [DRIVER]
      },
      async releaseDocument() {
        throw new Error('not used by this contract')
      },
      async setTrailer() {
        throw new Error('not used by this contract')
      },
      async updateCrew() {
        throw new Error('not used by this contract')
      },
    }

    const tripUseCase = createTripUseCase({
      locations: { async purgeByTrip() {} },
      repository,
    })

    const composer = createTripComposer({
      create: (input) => tripUseCase.create(input),
      findLiveTripIdForDocuments: async () => {
        throw new Error('not used by this contract')
      },
      link: async () => ({}),
      listStops: async () => [],
      planRoute: async () => ({}),
      reorder: async () => ({}),
      writeEstimatedArrivals: async () => {},
    })

    return { composer, tripUseCase }
  }

  test('driverId null (par sem motorista, 081 RF-5) continua criando a viagem, agora awaiting_crew', async () => {
    const { composer } = buildComposer()

    const { tripId } = await composer.createTrip({
      context: CONTEXT,
      driverId: null,
      vehicleId: VEHICLE_ID,
    })

    expect(tripId).toBe(TRIP_ID)
  })

  test('a viagem nascida do par sem motorista fica awaiting_crew, não draft (RF3/D1)', async () => {
    const repositoryCreateCalls: object[] = []
    const repository: TripRepositoryPort = {
      async close() {
        throw new Error('not used')
      },
      async create(input) {
        repositoryCreateCalls.push(input)
        return openTrip({
          status: resolveCrewStatus({
            hasDriver: input.crew.length > 0,
            hasVehicle: input.vehicleId !== null,
          }),
          vehicleId: input.vehicleId,
        })
      },
      async findById() {
        return openTrip()
      },
      async findDocumentById() {
        return null
      },
      async findLiveTripIdForDocuments() {
        throw new Error('not used')
      },
      async findVehicle() {
        return VEHICLE
      },
      async isTrailerInOpenTrip() {
        return false
      },
      async linkDocument() {
        throw new Error('not used')
      },
      async list() {
        return { items: [], nextCursor: null }
      },
      async listDrivers() {
        return []
      },
      async releaseDocument() {
        throw new Error('not used')
      },
      async setTrailer() {
        throw new Error('not used')
      },
      async updateCrew() {
        throw new Error('not used')
      },
    }
    const tripUseCase = createTripUseCase({ locations: { async purgeByTrip() {} }, repository })

    const trip = await tripUseCase.create({
      context: CONTEXT,
      driverIds: [],
      vehicleId: VEHICLE_ID,
    })

    expect(trip.status).toBe('awaiting_crew')
    expect(repositoryCreateCalls).toEqual([
      {
        actorUserId: USER_ID,
        channel: 'backoffice',
        companyId: COMPANY_ID,
        crew: [],
        trailerVehicleId: null,
        vehicleId: VEHICLE_ID,
      },
    ])
  })

  test('driverId presente (par completo) continua nascendo draft, sem regressão', async () => {
    const { composer } = buildComposer()

    const { tripId } = await composer.createTrip({
      context: CONTEXT,
      driverId: DRIVER_ID,
      vehicleId: VEHICLE_ID,
    })

    expect(tripId).toBe(TRIP_ID)
  })
})
