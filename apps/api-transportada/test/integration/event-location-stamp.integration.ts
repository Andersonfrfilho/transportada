/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 196 D2/D3 (ADR-0081 §2 e §3) contra o Postgres de verdade: o estado do ponto sai dos mesmos
 * casos de uso que o PWA e o escritório usam, e o banco recusa `captured` sem coordenada.
 *
 * Sem o estado, "o GPS falhou" e "não era toque do motorista" seriam o mesmo `null`, e a tela teria
 * de adivinhar pela idade e pelo tipo do evento. O molde é o de `delivery-proof-received-by`.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { fleetVehicles } from '../../src/database/database.schema.js'
import {
  companyOccurrenceTypes,
  tripDeliveryProofs,
  tripDocumentOccurrences,
  tripStatusEvents,
  tripStopEvents,
  tripStopOccurrences,
  trips,
  type TripStatus,
} from '../../src/database/trip.schema.js'
import { dispatchDriverTrip } from '../../src/trips/application/dispatch-driver-trip.use-case.js'
import { dispatchTrip } from '../../src/trips/application/dispatch-trip.use-case.js'
import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import { reportDocumentReturn } from '../../src/trips/application/report-document-delivery.use-case.js'
import { reportStopArrival } from '../../src/trips/application/report-stop-arrival.use-case.js'
import { reportStopDeparture } from '../../src/trips/application/report-stop-departure.use-case.js'
import { reportStopOccurrence } from '../../src/trips/application/report-stop-occurrence.use-case.js'
import {
  FIELD_TRIP_STEP,
  startFieldTrip,
  type FieldTripStep,
} from '../../src/trips/application/start-field-trip.use-case.js'
import { NO_EVENT_LOCATION_STAMP } from '../../src/trips/domain/event-location-stamp.policy.js'
import type { EventLocationStampColumns } from '../../src/trips/domain/event-location-stamp.types.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'
import {
  findDriverReachableDocument,
  findOccurrenceType,
  listDocumentProducts,
  saveTripOccurrence,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleCurrentDriverTripRepository } from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'
import { DrizzleDriverFieldReportTransaction } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { DrizzleTripRouteRepository } from '../../src/trips/infrastructure/drizzle-trip-route.repository.js'
import { recordTripStatusChange } from '../../src/trips/infrastructure/trip-status-event.persistence.js'
import { listTripTimeline } from '../../src/trips/infrastructure/trip-timeline.query.js'
import { attachDeliveryProof } from '../../src/trips/application/attach-delivery-proof.use-case.js'
import type { ReportedLocation } from '../../src/trips/application/driver-field-report.port.js'
import { reportDocumentDelivery } from '../../src/trips/application/report-document-delivery.use-case.js'
import { resolveFieldTripTarget } from '../../src/trips/application/resolve-field-trip-target.use-case.js'
import { DrizzleDeliveryProofRepository } from '../../src/trips/infrastructure/drizzle-delivery-proof.repository.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { DrizzleFieldTripTargetRepository } from '../../src/trips/infrastructure/drizzle-field-trip-target.repository.js'
import { parseDeliveryProofUpload } from '../../src/trips/presentation/delivery-proof.schema.js'
import {
  FAKE_ENVELOPE,
  JPEG_BYTES,
  linkDriverMembership,
  seedCompany,
  seedStopArrival,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
  type Company,
  type SeededTrip,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const NOW = new Date('2026-09-18T13:00:00.000Z')
const ARRIVED_AT = new Date('2026-09-18T09:00:00.000Z')

/** Ponto sintético de teste — coordenada nunca sai em log, nem aqui (ADR-0081 §6.1). */
const REPORTED_LOCATION: ReportedLocation = {
  accuracyMeters: '12.00',
  capturedAt: NOW.toISOString(),
  latitude: '-23.5505199',
  longitude: '-46.6333094',
}

type DriverWorld = Readonly<{
  company: Company
  database: TestDatabase
  driverUserId: string
  trip: SeededTrip
}>

async function seedDriverWorld(database: TestDatabase): Promise<DriverWorld> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  await seedStopArrival(database, trip, ARRIVED_AT)
  const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)

  return { company, database, driverUserId, trip }
}

async function readEventLocationStates(world: DriverWorld): Promise<readonly (string | null)[]> {
  const rows = await world.database.db
    .select({ locationState: tripStopEvents.locationState })
    .from(tripStopEvents)
    .where(eq(tripStopEvents.tripDocumentId, world.trip.documentId))

  return rows.map((row) => row.locationState)
}

describe('o estado do ponto do evento contra o Postgres (spec 196 D2/D3, ADR-0081 §3)', () => {
  testWithPostgres('o motorista com coordenada grava captured', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedDriverWorld(database)

      await reportDocumentDelivery({
        actorUserId: world.driverUserId,
        companyId: world.company.companyId,
        documentId: world.trip.documentId,
        driverId: world.company.firstDriverId,
        idempotencyKey: 'entrega-com-ponto',
        location: REPORTED_LOCATION,
        now: NOW,
        unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket'),
      })

      expect(await readEventLocationStates(world)).toEqual(['captured'])
    })
  })

  testWithPostgres(
    'o motorista sem coordenada grava unavailable — ele tocou e a posição não veio',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDriverWorld(database)

        await reportDocumentDelivery({
          actorUserId: world.driverUserId,
          companyId: world.company.companyId,
          documentId: world.trip.documentId,
          driverId: world.company.firstDriverId,
          idempotencyKey: 'entrega-sem-ponto',
          location: null,
          now: NOW,
          unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket'),
        })

        expect(await readEventLocationStates(world)).toEqual(['unavailable'])
      })
    },
  )

  testWithPostgres(
    'o escritório sem coordenada fica null — não se aplica, e vermelho ali seria mentira',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDriverWorld(database)
        const target = await resolveFieldTripTarget({
          companyId: world.company.companyId,
          repository: new DrizzleFieldTripTargetRepository(database.db),
          target: { kind: 'trip', tripId: world.trip.tripId },
        })

        await reportDocumentDelivery({
          actorUserId: world.company.userId,
          companyId: world.company.companyId,
          documentId: world.trip.documentId,
          idempotencyKey: 'entrega-do-escritorio',
          location: null,
          now: NOW,
          /** ADR-0067 §3: o canal `office` valida a hora informada contra "agora". */
          recordedAt: NOW,
          target,
          unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket'),
        })

        expect(await readEventLocationStates(world)).toEqual([null])
      })
    },
  )

  testWithPostgres('o banco recusa captured sem latitude', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedDriverWorld(database)
      await reportDocumentDelivery({
        actorUserId: world.driverUserId,
        companyId: world.company.companyId,
        documentId: world.trip.documentId,
        driverId: world.company.firstDriverId,
        idempotencyKey: 'entrega-sem-ponto',
        location: null,
        now: NOW,
        unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket'),
      })

      const error = await database.db
        .update(tripStopEvents)
        .set({ locationState: 'captured' })
        .where(eq(tripStopEvents.tripDocumentId, world.trip.documentId))
        .execute()
        .catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(Error)
      expect(String((error as { readonly cause?: unknown }).cause)).toContain(
        'trip_stop_events_location_state_consistency_check',
      )

      expect(await readEventLocationStates(world)).toEqual(['unavailable'])
    })
  })

  /**
   * A outra metade da mesma afirmação, e a que passou despercebida: coordenada com estado nulo. O
   * CHECK original abria com `"location_state" is null or`, então aceitava esta linha calada — e
   * nenhum teste tentava inseri-la. CHECK que avalia `NULL` passa em Postgres; só a comparação
   * null-safe fecha o buraco.
   */
  testWithPostgres('o banco recusa coordenada com estado nulo', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedDriverWorld(database)
      await reportDocumentDelivery({
        actorUserId: world.driverUserId,
        companyId: world.company.companyId,
        documentId: world.trip.documentId,
        driverId: world.company.firstDriverId,
        idempotencyKey: 'entrega-com-ponto',
        location: REPORTED_LOCATION,
        now: NOW,
        unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket'),
      })

      const error = await database.db
        .update(tripStopEvents)
        .set({ locationState: null })
        .where(eq(tripStopEvents.tripDocumentId, world.trip.documentId))
        .execute()
        .catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(Error)
      expect(String((error as { readonly cause?: unknown }).cause)).toContain(
        'trip_stop_events_location_state_consistency_check',
      )

      expect(await readEventLocationStates(world)).toEqual(['captured'])
    })
  })
})

describe('o estado do ponto do comprovante contra o Postgres (spec 196 D2, ADR-0081 §3)', () => {
  testWithPostgres('a foto do motorista carrega o estado do próprio ponto', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedDriverWorld(database)
      await reportDocumentDelivery({
        actorUserId: world.driverUserId,
        companyId: world.company.companyId,
        documentId: world.trip.documentId,
        driverId: world.company.firstDriverId,
        idempotencyKey: 'entrega-para-a-foto',
        location: null,
        now: NOW,
        unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket'),
      })

      await attachProofFromDriver(world, {
        accuracyMeters: REPORTED_LOCATION.accuracyMeters ?? '',
        capturedAt: REPORTED_LOCATION.capturedAt,
        kind: 'cargo',
        latitude: REPORTED_LOCATION.latitude,
        longitude: REPORTED_LOCATION.longitude,
      })
      await attachProofFromDriver(world, { kind: 'photo', receiverName: 'Maria Recebedora' })

      const rows = await database.db
        .select({
          kind: tripDeliveryProofs.kind,
          locationState: tripDeliveryProofs.locationState,
        })
        .from(tripDeliveryProofs)
        .where(eq(tripDeliveryProofs.companyId, world.company.companyId))
        .orderBy(tripDeliveryProofs.kind)

      expect(rows).toEqual([
        { kind: 'cargo', locationState: 'captured' },
        { kind: 'photo', locationState: 'unavailable' },
      ])
    })
  })
})

/** O multipart que a app manda, lido pela mesma função da rota (`parseDeliveryProofUpload`). */
async function attachProofFromDriver(
  world: DriverWorld,
  fields: Readonly<Record<string, string>>,
): Promise<void> {
  const form = new FormData()
  form.set('file', new File([JPEG_BYTES], 'comprovante.jpg', { type: 'image/jpeg' }))
  for (const [name, value] of Object.entries(fields)) form.set(name, value)

  await attachDeliveryProof({
    actorUserId: world.driverUserId,
    companyId: world.company.companyId,
    documentId: world.trip.documentId,
    driverId: world.company.firstDriverId,
    newObjectId: () => crypto.randomUUID(),
    newProofId: () => crypto.randomUUID(),
    now: NOW,
    repository: new DrizzleDeliveryProofRepository(world.database.db, 'test-bucket'),
    sealDocument: async () => FAKE_ENVELOPE,
    storage: { store: async () => ({ sha256: 'e'.repeat(64) }) },
    upload: await parseDeliveryProofUpload(
      new Request('http://localhost/me/trips/current/documents/x/proof', {
        body: form,
        method: 'POST',
      }),
    ),
  })
}

/* ---------------------------------------------------------------------------------------------
 * T3.5 — o ponto de cada toque do motorista contra o Postgres (ADR-0081 §3/§4, CA01–CA04).
 * ------------------------------------------------------------------------------------------- */

const TAPPED_AT = new Date('2026-09-18T12:59:00.000Z')

type StampRow = {
  readonly accuracyMeters: string | null
  readonly capturedAt: Date | null
  readonly channel: string
  readonly latitude: string | null
  readonly locationState: string | null
  readonly longitude: string | null
}

/** O carimbo de um toque do motorista com ponto, na forma que a política devolve. */
const CAPTURED_STAMP: EventLocationStampColumns = {
  accuracyMeters: REPORTED_LOCATION.accuracyMeters,
  capturedAt: new Date(REPORTED_LOCATION.capturedAt),
  latitude: REPORTED_LOCATION.latitude,
  locationState: 'captured',
  longitude: REPORTED_LOCATION.longitude,
}

function expectCaptured(row: StampRow | undefined): void {
  expect(row).toMatchObject({
    accuracyMeters: '12.00',
    latitude: '-23.5505199',
    locationState: 'captured',
    longitude: '-46.6333094',
  })
  expect(row?.capturedAt?.toISOString()).toBe(NOW.toISOString())
}

function expectUnavailable(row: StampRow | undefined): void {
  expect(row).toMatchObject({
    accuracyMeters: null,
    capturedAt: null,
    latitude: null,
    locationState: 'unavailable',
    longitude: null,
  })
}

function expectNotApplicable(row: StampRow | undefined): void {
  expect(row).toMatchObject({
    accuracyMeters: null,
    capturedAt: null,
    latitude: null,
    locationState: null,
    longitude: null,
  })
}

async function seedWorldAt(
  database: TestDatabase,
  status: TripStatus,
  options: { readonly hasArrived?: boolean; readonly hasTrailer?: boolean } = {},
): Promise<DriverWorld> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, status)
  if (options.hasArrived === true) await seedStopArrival(database, trip, ARRIVED_AT)
  if (options.hasTrailer === true) {
    const trailerId = crypto.randomUUID()
    await database.db.insert(fleetVehicles).values({
      companyId: company.companyId,
      id: trailerId,
      plate: 'RTE6K89',
      role: 'trailer',
      state: 'SP',
      vehicleType: '',
    })
    await database.db
      .update(trips)
      .set({ trailerVehicleId: trailerId })
      .where(eq(trips.id, trip.tripId))
  }
  const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)

  return { company, database, driverUserId, trip }
}

async function readStatusEvents(
  world: DriverWorld,
  toStatus: string,
): Promise<readonly StampRow[]> {
  return world.database.db
    .select({
      accuracyMeters: tripStatusEvents.accuracyMeters,
      capturedAt: tripStatusEvents.capturedAt,
      channel: tripStatusEvents.channel,
      latitude: tripStatusEvents.latitude,
      locationState: tripStatusEvents.locationState,
      longitude: tripStatusEvents.longitude,
    })
    .from(tripStatusEvents)
    .where(
      and(
        eq(tripStatusEvents.companyId, world.company.companyId),
        eq(tripStatusEvents.tripId, world.trip.tripId),
        eq(tripStatusEvents.toStatus, toStatus as TripStatus),
      ),
    )
}

async function readStopOccurrences(world: DriverWorld): Promise<readonly StampRow[]> {
  return world.database.db
    .select({
      accuracyMeters: tripStopOccurrences.accuracyMeters,
      capturedAt: tripStopOccurrences.capturedAt,
      channel: tripStopOccurrences.channel,
      latitude: tripStopOccurrences.latitude,
      locationState: tripStopOccurrences.locationState,
      longitude: tripStopOccurrences.longitude,
    })
    .from(tripStopOccurrences)
    .where(eq(tripStopOccurrences.stopId, world.trip.stopId))
}

async function readDocumentOccurrences(world: DriverWorld): Promise<readonly StampRow[]> {
  return world.database.db
    .select({
      accuracyMeters: tripDocumentOccurrences.accuracyMeters,
      capturedAt: tripDocumentOccurrences.capturedAt,
      channel: tripDocumentOccurrences.channel,
      latitude: tripDocumentOccurrences.latitude,
      locationState: tripDocumentOccurrences.locationState,
      longitude: tripDocumentOccurrences.longitude,
    })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.tripDocumentId, world.trip.documentId))
}

async function readStopEvents(world: DriverWorld, kind: string): Promise<readonly StampRow[]> {
  return world.database.db
    .select({
      accuracyMeters: tripStopEvents.accuracyMeters,
      capturedAt: tripStopEvents.capturedAt,
      channel: tripStopEvents.channel,
      latitude: tripStopEvents.latitude,
      locationState: tripStopEvents.locationState,
      longitude: tripStopEvents.longitude,
    })
    .from(tripStopEvents)
    .where(
      and(eq(tripStopEvents.stopId, world.trip.stopId), eq(tripStopEvents.kind, kind as 'arrived')),
    )
}

/** A composição de `main.ts` para o despacho do motorista, com o caso de uso e o repositório reais. */
function dispatchAsDriver(world: DriverWorld, location: ReportedLocation | null) {
  const routeRepository = new DrizzleTripRouteRepository(world.database.db)

  return dispatchDriverTrip({
    actorUserId: world.driverUserId,
    companyId: world.company.companyId,
    dispatch: (request) =>
      dispatchTrip({
        actorUserId: request.actorUserId,
        channel: TRIP_FIELD_CHANNELS.driverApp,
        companyId: world.company.companyId,
        locationStamp: request.locationStamp,
        repository: routeRepository,
        tripId: request.tripId,
      }),
    driverId: world.company.firstDriverId,
    linkage: new DrizzleCurrentDriverTripRepository(world.database.db),
    location,
    tripId: world.trip.tripId,
  })
}

function fieldStepAsDriver(
  world: DriverWorld,
  step: FieldTripStep,
  location: ReportedLocation | null,
) {
  return startFieldTrip({
    actorUserId: world.driverUserId,
    companyId: world.company.companyId,
    driverId: world.company.firstDriverId,
    location,
    repository: new DrizzleCurrentDriverTripRepository(world.database.db),
    step,
  })
}

async function seedStopOccurrenceType(world: DriverWorld): Promise<string> {
  const id = crypto.randomUUID()
  await world.database.db.insert(companyOccurrenceTypes).values({
    companyId: world.company.companyId,
    flow: 'document',
    id,
    name: 'Recusa total',
    stage: 'delivery',
  })

  return id
}

function registerDocumentOccurrenceAs(
  world: DriverWorld,
  params: {
    readonly channel?: typeof TRIP_FIELD_CHANNELS.whatsapp
    readonly location: ReportedLocation | null
    readonly occurrenceTypeId: string
  },
) {
  return registerDriverOccurrence({
    actorUserId: world.driverUserId,
    companyId: world.company.companyId,
    documentId: world.trip.documentId,
    driverId: world.company.firstDriverId,
    idempotencyKey: crypto.randomUUID(),
    location: params.location,
    note: 'cliente recusou',
    occurrenceTypeId: params.occurrenceTypeId,
    productCode: '',
    repository: {
      findConfirmedUpload: async () => null,
      findOccurrenceType: (query) => findOccurrenceType(world.database.db, query),
      findReachableDocument: (query) => findDriverReachableDocument(world.database.db, query),
      listDocumentProducts: (query) => listDocumentProducts(world.database.db, query),
    },
    unitOfWork: new DrizzleDriverFieldReportUnitOfWork(world.database.db, 'test-bucket'),
    ...(params.channel === undefined ? {} : { channel: params.channel }),
  })
}

function reportStopOccurrenceAs(
  world: DriverWorld,
  params: {
    readonly channel?: typeof TRIP_FIELD_CHANNELS.whatsapp
    readonly location: ReportedLocation | null
  },
) {
  return reportStopOccurrence({
    actorUserId: world.driverUserId,
    attachmentObjectId: null,
    companyId: world.company.companyId,
    description: 'Duas horas na fila da doca',
    distanceMeters: null,
    documentId: null,
    driverId: world.company.firstDriverId,
    idempotencyKey: crypto.randomUUID(),
    kind: 'long_wait',
    location: params.location,
    stopId: world.trip.stopId,
    unitOfWork: new DrizzleDriverFieldReportUnitOfWork(world.database.db, 'test-bucket'),
    ...(params.channel === undefined ? {} : { channel: params.channel }),
  })
}

describe('CA01 — cada toque de status do motorista carimba o ponto no evento de status (ADR-0081 §3)', () => {
  testWithPostgres('despachar com ponto grava captured; sem ponto, unavailable', async () => {
    await withDisposableDatabase(async (database) => {
      const withPoint = await seedWorldAt(database, 'route_planned', { hasTrailer: true })
      await dispatchAsDriver(withPoint, REPORTED_LOCATION)
      const [dispatchedWithPoint, ...otherWithPoint] = await readStatusEvents(
        withPoint,
        'dispatched',
      )
      expect(otherWithPoint).toEqual([])
      expect(dispatchedWithPoint?.channel).toBe('driver_app')
      expectCaptured(dispatchedWithPoint)

      const withoutPoint = await seedWorldAt(database, 'route_planned', { hasTrailer: true })
      await dispatchAsDriver(withoutPoint, null)
      const [dispatchedWithoutPoint] = await readStatusEvents(withoutPoint, 'dispatched')
      expectUnavailable(dispatchedWithoutPoint)
    })
  })

  testWithPostgres(
    'conferir a carga com ponto grava captured; sem ponto, unavailable',
    async () => {
      await withDisposableDatabase(async (database) => {
        const withPoint = await seedWorldAt(database, 'dispatched')
        await fieldStepAsDriver(withPoint, FIELD_TRIP_STEP.confirmLoad, REPORTED_LOCATION)
        expectCaptured((await readStatusEvents(withPoint, 'in_transit'))[0])

        const withoutPoint = await seedWorldAt(database, 'dispatched')
        await fieldStepAsDriver(withoutPoint, FIELD_TRIP_STEP.confirmLoad, null)
        expectUnavailable((await readStatusEvents(withoutPoint, 'in_transit'))[0])
      })
    },
  )

  testWithPostgres('iniciar a rota com ponto grava captured; sem ponto, unavailable', async () => {
    await withDisposableDatabase(async (database) => {
      const withPoint = await seedWorldAt(database, 'in_transit')
      await fieldStepAsDriver(withPoint, FIELD_TRIP_STEP.startRoute, REPORTED_LOCATION)
      expectCaptured((await readStatusEvents(withPoint, 'on_delivery_route'))[0])

      const withoutPoint = await seedWorldAt(database, 'in_transit')
      await fieldStepAsDriver(withoutPoint, FIELD_TRIP_STEP.startRoute, null)
      expectUnavailable((await readStatusEvents(withoutPoint, 'on_delivery_route'))[0])
    })
  })

  testWithPostgres(
    'o toque repetido sem efeito não grava segundo evento, nem segundo ponto',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorldAt(database, 'dispatched')

        await fieldStepAsDriver(world, FIELD_TRIP_STEP.confirmLoad, REPORTED_LOCATION)
        const repeated = await fieldStepAsDriver(world, FIELD_TRIP_STEP.confirmLoad, null)

        expect(repeated.changed).toBe(false)
        const events = await readStatusEvents(world, 'in_transit')
        expect(events).toHaveLength(1)
        expectCaptured(events[0])
      })
    },
  )
})

describe('CA01 — a ocorrência e a chegada/saída/devolução carimbam o ponto (ADR-0081 §3)', () => {
  testWithPostgres(
    'a ocorrência da parada com ponto grava captured; sem ponto, unavailable',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorldAt(database, 'in_transit', { hasArrived: true })

        await reportStopOccurrenceAs(world, { location: REPORTED_LOCATION })
        await reportStopOccurrenceAs(world, { location: null })

        const rows = await readStopOccurrences(world)
        expect(rows).toHaveLength(2)
        expect(rows.every((row) => row.channel === 'driver_app')).toBe(true)
        expectCaptured(rows.find((row) => row.locationState === 'captured'))
        expectUnavailable(rows.find((row) => row.locationState === 'unavailable'))
      })
    },
  )

  testWithPostgres(
    'a ocorrência da nota com ponto grava captured; sem ponto, unavailable',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorldAt(database, 'in_transit', { hasArrived: true })
        const occurrenceTypeId = await seedStopOccurrenceType(world)

        await registerDocumentOccurrenceAs(world, { location: REPORTED_LOCATION, occurrenceTypeId })
        await registerDocumentOccurrenceAs(world, { location: null, occurrenceTypeId })

        const rows = await readDocumentOccurrences(world)
        expect(rows).toHaveLength(2)
        expectCaptured(rows.find((row) => row.locationState === 'captured'))
        expectUnavailable(rows.find((row) => row.locationState === 'unavailable'))
      })
    },
  )

  testWithPostgres('chegada e saída com ponto gravam captured no evento da parada', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorldAt(database, 'dispatched')
      const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket')
      const common = {
        actorUserId: world.driverUserId,
        companyId: world.company.companyId,
        driverId: world.company.firstDriverId,
        location: REPORTED_LOCATION,
        now: NOW,
        stopId: world.trip.stopId,
        unitOfWork,
      }

      await reportStopDeparture({ ...common, idempotencyKey: 'saida', tappedAt: TAPPED_AT })
      await reportStopArrival({ ...common, idempotencyKey: 'chegada' })

      expectCaptured((await readStopEvents(world, 'departed'))[0])
      expectCaptured((await readStopEvents(world, 'arrived'))[0])
    })
  })

  testWithPostgres('a devolução sem ponto grava unavailable', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorldAt(database, 'in_transit', { hasArrived: true })

      await reportDocumentReturn({
        actorUserId: world.driverUserId,
        companyId: world.company.companyId,
        documentId: world.trip.documentId,
        driverId: world.company.firstDriverId,
        idempotencyKey: 'devolucao',
        location: null,
        now: NOW,
        reason: 'establishment_closed',
        unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket'),
      })

      expectUnavailable((await readStopEvents(world, 'returned'))[0])
    })
  })
})

describe('CA02 — a troca de status que o toque deriva não leva ponto (ADR-0081 §4)', () => {
  testWithPostgres('a chegada leva a viagem a in_transit, e a troca fica null', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorldAt(database, 'dispatched')

      await reportStopArrival({
        actorUserId: world.driverUserId,
        companyId: world.company.companyId,
        driverId: world.company.firstDriverId,
        idempotencyKey: 'chegada-deriva',
        location: REPORTED_LOCATION,
        now: NOW,
        stopId: world.trip.stopId,
        unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket'),
      })

      expectCaptured((await readStopEvents(world, 'arrived'))[0])
      const derived = await readStatusEvents(world, 'in_transit')
      expect(derived).toHaveLength(1)
      expectNotApplicable(derived[0])
    })
  })

  testWithPostgres(
    'a entrega que fecha a viagem leva o ponto no evento da nota, e a conclusão fica null',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorldAt(database, 'in_transit', { hasArrived: true })

        await reportDocumentReturn({
          actorUserId: world.driverUserId,
          companyId: world.company.companyId,
          documentId: world.trip.documentId,
          driverId: world.company.firstDriverId,
          idempotencyKey: 'devolucao-fecha',
          location: REPORTED_LOCATION,
          now: NOW,
          reason: 'establishment_closed',
          unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket'),
        })

        expectCaptured((await readStopEvents(world, 'returned'))[0])
        const concluded = await readStatusEvents(world, 'completed')
        expect(concluded).toHaveLength(1)
        expectNotApplicable(concluded[0])
      })
    },
  )
})

describe('CA03 — escritório null, WhatsApp do motorista unavailable, WhatsApp do operador null (ADR-0081 §3)', () => {
  testWithPostgres('o escritório não carimba o evento de status nem a ocorrência', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorldAt(database, 'dispatched', { hasArrived: true })
      const target = await resolveFieldTripTarget({
        companyId: world.company.companyId,
        repository: new DrizzleFieldTripTargetRepository(database.db),
        target: { kind: 'trip', tripId: world.trip.tripId },
      })

      await startFieldTrip({
        actorUserId: world.company.userId,
        companyId: world.company.companyId,
        /** Nem se alguém mandasse ponto: o escritório age em nome do motorista. */
        location: REPORTED_LOCATION,
        repository: new DrizzleCurrentDriverTripRepository(database.db),
        step: FIELD_TRIP_STEP.confirmLoad,
        target,
      })
      await reportStopOccurrence({
        actorUserId: world.company.userId,
        attachmentObjectId: null,
        companyId: world.company.companyId,
        description: 'Registrada pelo escritório',
        distanceMeters: null,
        documentId: null,
        idempotencyKey: crypto.randomUUID(),
        kind: 'long_wait',
        location: REPORTED_LOCATION,
        stopId: world.trip.stopId,
        target,
        unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket'),
      })

      const [statusEvent] = await readStatusEvents(world, 'in_transit')
      expect(statusEvent?.channel).toBe('office')
      expectNotApplicable(statusEvent)
      const [occurrence] = await readStopOccurrences(world)
      expect(occurrence?.channel).toBe('office')
      expectNotApplicable(occurrence)
    })
  })

  testWithPostgres('o motorista pelo WhatsApp grava unavailable nas três ações', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorldAt(database, 'in_transit', { hasArrived: true })
      const occurrenceTypeId = await seedStopOccurrenceType(world)

      await registerDocumentOccurrenceAs(world, {
        channel: TRIP_FIELD_CHANNELS.whatsapp,
        location: null,
        occurrenceTypeId,
      })
      await reportStopOccurrenceAs(world, { channel: TRIP_FIELD_CHANNELS.whatsapp, location: null })
      await reportDocumentReturn({
        actorUserId: world.driverUserId,
        channel: TRIP_FIELD_CHANNELS.whatsapp,
        companyId: world.company.companyId,
        documentId: world.trip.documentId,
        driverId: world.company.firstDriverId,
        idempotencyKey: 'devolucao-whatsapp',
        location: null,
        now: NOW,
        reason: 'establishment_closed',
        unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket'),
      })

      const [documentOccurrence] = await readDocumentOccurrences(world)
      const [stopOccurrence] = await readStopOccurrences(world)
      const [returned] = await readStopEvents(world, 'returned')
      for (const row of [documentOccurrence, stopOccurrence, returned]) {
        expect(row?.channel).toBe('whatsapp')
        expectUnavailable(row)
      }
    })
  })

  testWithPostgres(
    'o operador pelo WhatsApp não carimba: despacho e ocorrência de separação ficam null',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorldAt(database, 'route_planned', { hasTrailer: true })
        const occurrenceTypeId = await seedStopOccurrenceType(world)

        /** A composição do operador em `main.ts`: o mesmo `dispatchTrip`, canal `whatsapp`, sem carimbo. */
        await dispatchTrip({
          actorUserId: world.company.userId,
          channel: TRIP_FIELD_CHANNELS.whatsapp,
          companyId: world.company.companyId,
          repository: new DrizzleTripRouteRepository(database.db),
          tripId: world.trip.tripId,
        })
        await saveTripOccurrence(database.db, {
          actorUserId: world.company.userId,
          authorship: { channel: TRIP_FIELD_CHANNELS.whatsapp, onBehalfOfDriverId: null },
          companyId: world.company.companyId,
          documentId: world.trip.documentId,
          note: 'faltou item na separação',
          occurrenceTypeId,
          productCode: '',
          stage: 'separation',
          tripId: world.trip.tripId,
          typeName: 'Recusa total',
        })

        const [statusEvent] = await readStatusEvents(world, 'dispatched')
        expect(statusEvent?.channel).toBe('whatsapp')
        expectNotApplicable(statusEvent)
        const [occurrence] = await readDocumentOccurrences(world)
        expect(occurrence?.channel).toBe('whatsapp')
        expectNotApplicable(occurrence)
      })
    },
  )
})

describe('CA04 — o banco recusa ponto com canal office e estado com canal backoffice (ADR-0081 §3)', () => {
  async function rejection(operation: Promise<unknown>): Promise<string> {
    const error = await operation.then(
      () => undefined,
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(Error)

    return String((error as { readonly cause?: unknown }).cause)
  }

  const OFFICE_WITH_POINT = {
    authorship: { channel: TRIP_FIELD_CHANNELS.office },
    stamp: CAPTURED_STAMP,
  } as const
  const BACKOFFICE_WITH_STATE = {
    authorship: { channel: TRIP_FIELD_CHANNELS.backoffice },
    stamp: { ...NO_EVENT_LOCATION_STAMP, locationState: 'unavailable' },
  } as const

  testWithPostgres('trip_status_events', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorldAt(database, 'in_transit')
      const write = (channel: 'backoffice' | 'office', locationStamp: EventLocationStampColumns) =>
        database.db.transaction((transaction) =>
          recordTripStatusChange(transaction, {
            actorUserId: world.company.userId,
            channel,
            companyId: world.company.companyId,
            fromStatus: 'in_transit',
            locationStamp,
            onBehalfOfDriverId: channel === 'office' ? world.company.firstDriverId : null,
            toStatus: 'on_delivery_route',
            tripId: world.trip.tripId,
          }),
        )

      expect(await rejection(write('office', OFFICE_WITH_POINT.stamp))).toContain(
        'trip_status_events_coordinates_channel_check',
      )
      expect(await rejection(write('backoffice', BACKOFFICE_WITH_STATE.stamp))).toContain(
        'trip_status_events_location_state_channel_check',
      )
      expect(await readStatusEvents(world, 'on_delivery_route')).toEqual([])
    })
  })

  testWithPostgres('trip_stop_occurrences', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorldAt(database, 'in_transit', { hasArrived: true })
      const write = (channel: 'backoffice' | 'office', locationStamp: EventLocationStampColumns) =>
        database.db.transaction((transaction) =>
          new DrizzleDriverFieldReportTransaction(transaction, 'test-bucket').recordOccurrence({
            actorUserId: world.company.userId,
            attachmentObjectId: null,
            authorship: {
              channel,
              onBehalfOfDriverId: channel === 'office' ? world.company.firstDriverId : null,
            },
            companyId: world.company.companyId,
            description: 'x',
            distanceMeters: null,
            documentId: null,
            kind: 'long_wait',
            locationStamp,
            occurrenceTypeId: null,
            stopId: world.trip.stopId,
          }),
        )

      expect(await rejection(write('office', OFFICE_WITH_POINT.stamp))).toContain(
        'trip_stop_occurrences_coordinates_channel_check',
      )
      expect(await rejection(write('backoffice', BACKOFFICE_WITH_STATE.stamp))).toContain(
        'trip_stop_occurrences_location_state_channel_check',
      )
      expect(await readStopOccurrences(world)).toEqual([])
    })
  })

  testWithPostgres('trip_document_occurrences', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorldAt(database, 'in_transit', { hasArrived: true })
      const occurrenceTypeId = await seedStopOccurrenceType(world)
      const write = (channel: 'backoffice' | 'office', locationStamp: EventLocationStampColumns) =>
        saveTripOccurrence(database.db, {
          actorUserId: world.company.userId,
          authorship: {
            channel,
            onBehalfOfDriverId: channel === 'office' ? world.company.firstDriverId : null,
          },
          companyId: world.company.companyId,
          documentId: world.trip.documentId,
          locationStamp,
          note: 'x',
          occurrenceTypeId,
          productCode: '',
          stage: 'delivery',
          tripId: world.trip.tripId,
          typeName: 'Recusa total',
        })

      expect(await rejection(write('office', OFFICE_WITH_POINT.stamp))).toContain(
        'trip_document_occurrences_coordinates_channel_check',
      )
      expect(await rejection(write('backoffice', BACKOFFICE_WITH_STATE.stamp))).toContain(
        'trip_document_occurrences_location_state_channel_check',
      )
      expect(await readDocumentOccurrences(world)).toEqual([])
    })
  })
})

describe('isolamento por empresa do ponto gravado (ADR-0081 §6)', () => {
  testWithPostgres('o ponto da empresa A não aparece para a empresa B', async () => {
    await withDisposableDatabase(async (database) => {
      const companyA = await seedWorldAt(database, 'route_planned', { hasTrailer: true })
      const companyB = await seedWorldAt(database, 'in_transit')
      await dispatchAsDriver(companyA, REPORTED_LOCATION)

      const rowsOfB = await database.db
        .select({ latitude: tripStatusEvents.latitude })
        .from(tripStatusEvents)
        .where(eq(tripStatusEvents.companyId, companyB.company.companyId))
      expect(rowsOfB.every((row) => row.latitude === null)).toBe(true)

      const timelineAsB = await listTripTimeline(database.db, {
        companyId: companyB.company.companyId,
        cursor: null,
        limit: 100,
        tripId: companyA.trip.tripId,
      })
      expect(timelineAsB.items).toEqual([])

      const rowsOfAThroughB = await database.db
        .select({ latitude: tripStatusEvents.latitude })
        .from(tripStatusEvents)
        .where(
          and(
            eq(tripStatusEvents.companyId, companyB.company.companyId),
            eq(tripStatusEvents.tripId, companyA.trip.tripId),
          ),
        )
      expect(rowsOfAThroughB).toEqual([])
      expectCaptured((await readStatusEvents(companyA, 'dispatched'))[0])
    })
  })
})
