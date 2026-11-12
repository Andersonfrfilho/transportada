/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T2.5 (RF8/RF12/RF13) contra o Postgres de verdade: a baixa do motorista que fecha a
 * parada devolve a próxima do roteiro; a que não fecha, a última parada e o escritório não devolvem.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { geocodedAddresses } from '../../src/database/geocoding.schema.js'
import { nfeParticipants } from '../../src/database/nfe.schema.js'
import { tripDocuments, tripStops } from '../../src/database/trip.schema.js'
import { reportDocumentDelivery } from '../../src/trips/application/report-document-delivery.use-case.js'
import { resolveFieldTripTarget } from '../../src/trips/application/resolve-field-trip-target.use-case.js'
import { DrizzleCurrentDriverTripRepository } from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { DrizzleFieldTripTargetRepository } from '../../src/trips/infrastructure/drizzle-field-trip-target.repository.js'
import {
  linkDriverMembership,
  seedCompany,
  seedExtraDocument,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
  type Company,
  type SeededTrip,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

type World = Readonly<{
  company: Company
  database: TestDatabase
  driverUserId: string
  trip: SeededTrip
}>

const SETTLED_AT = new Date('2026-09-18T09:00:00.000Z')

/** A parada semeada vira a de sequência 3; as demais completam as cinco do roteiro. */
async function seedFiveStopTrip(database: TestDatabase): Promise<World> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)
  await database.db.update(tripStops).set({ sequence: 3n }).where(eq(tripStops.id, trip.stopId))
  for (const sequence of [1n, 2n, 4n, 5n]) {
    await seedStop({ company, database, sequence, trip })
  }

  return { company, database, driverUserId, trip }
}

async function seedStop(input: {
  readonly company: Company
  readonly database: TestDatabase
  readonly sequence: bigint
  readonly trip: SeededTrip
}): Promise<{ readonly documentId: string; readonly stopId: string }> {
  const { company, database, sequence, trip } = input
  const isDone = sequence < 3n
  const stopId = crypto.randomUUID()
  await database.db.insert(tripStops).values({
    addressKey: `key-${trip.tripId}-${sequence}`,
    arrivedAt: isDone ? SETTLED_AT : null,
    companyId: company.companyId,
    completedAt: isDone ? SETTLED_AT : null,
    id: stopId,
    label: `Rua ${sequence}, ${sequence * 10n}`,
    sequence,
    tripId: trip.tripId,
  })
  const documentId = await seedExtraDocument(database, company, trip, {
    separationStatus: 'loaded',
    stopId,
  })
  if (isDone) {
    await database.db
      .update(tripDocuments)
      .set({ deliveredAt: SETTLED_AT, separationStatus: 'delivered' })
      .where(eq(tripDocuments.id, documentId))
  }

  return { documentId, stopId }
}

async function seedCoordinate(input: {
  readonly database: TestDatabase
  readonly precision: 'city' | 'rooftop' | 'street'
  readonly stopId: string
}): Promise<void> {
  const [stop] = await input.database.db
    .select({ addressKey: tripStops.addressKey })
    .from(tripStops)
    .where(eq(tripStops.id, input.stopId))
  if (stop === undefined) throw new Error('stop not seeded')
  await input.database.db.insert(geocodedAddresses).values({
    addressKey: stop.addressKey,
    externalPlaceId: 'place-1',
    latitude: '-23.5500000',
    longitude: '-46.6300000',
    precision: input.precision,
    source: 'google',
  })
}

function deliver(world: World, documentId: string, key: string) {
  return reportDocumentDelivery({
    actorUserId: world.driverUserId,
    companyId: world.company.companyId,
    documentId,
    driverId: world.company.firstDriverId,
    idempotencyKey: key,
    location: null,
    now: new Date(),
    unitOfWork: new DrizzleDriverFieldReportUnitOfWork(world.database.db, 'test-bucket'),
  })
}

describe('a próxima parada na baixa que fecha a parada (spec 294 T2.5)', () => {
  testWithPostgres('fechar a 3 de 5 devolve a 4 com endereço e notas', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedFiveStopTrip(database)
      const [stopFour] = await database.db
        .select({ id: tripStops.id })
        .from(tripStops)
        .where(eq(tripStops.sequence, 4n))
      const stopFourId = stopFour?.id ?? ''
      await seedCoordinate({ database, precision: 'rooftop', stopId: stopFourId })

      const result = await deliver(world, world.trip.documentId, 'close-three')

      expect(result.stopCompleted).toBe(true)
      expect(result.nextStop).toMatchObject({
        address: 'Rua 4, 40',
        coordinate: { latitude: '-23.5500000', longitude: '-46.6300000' },
        id: stopFourId,
        isAddressReliable: true,
        precision: 'rooftop',
        sequence: 4,
        totalStops: 5,
      })
      expect(result.nextStop?.documents).toHaveLength(1)
    })
  })

  testWithPostgres(
    'sem coordenada ou com precisão de município, o endereço não é confiável',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedFiveStopTrip(database)
        const [stopFour] = await database.db
          .select({ id: tripStops.id })
          .from(tripStops)
          .where(eq(tripStops.sequence, 4n))
        await seedCoordinate({ database, precision: 'city', stopId: stopFour?.id ?? '' })

        const result = await deliver(world, world.trip.documentId, 'close-city')

        expect(result.nextStop?.isAddressReliable).toBe(false)
        expect(result.nextStop?.precision).toBe('city')
      })
    },
  )

  testWithPostgres('o destinatário vem da primeira nota da próxima parada', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedFiveStopTrip(database)
      const [stopFour] = await database.db
        .select({ id: tripStops.id })
        .from(tripStops)
        .where(eq(tripStops.sequence, 4n))
      const [document] = await database.db
        .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
        .from(tripDocuments)
        .where(eq(tripDocuments.stopId, stopFour?.id ?? ''))
      await database.db.insert(nfeParticipants).values({
        companyId: world.company.companyId,
        documentId: document?.nfeDocumentId ?? '',
        legalName: 'Razão Social Ltda',
        role: 'recipient',
        tradeName: 'Mercado do Zé',
      })

      const result = await deliver(world, world.trip.documentId, 'close-name')

      expect(result.nextStop?.recipientName).toBe('Mercado do Zé')
      expect(result.nextStop?.isAddressReliable).toBe(false)
      expect(result.nextStop?.coordinate).toBeNull()
    })
  })

  testWithPostgres('a última parada fechada devolve nextStop nulo', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)
      const world = { company, database, driverUserId, trip }

      const result = await deliver(world, trip.documentId, 'close-last')

      expect(result.stopCompleted).toBe(true)
      expect(result.tripCompleted).toBe(true)
      expect(result.nextStop).toBeNull()
    })
  })

  testWithPostgres(
    'parada com duas notas só oferece a próxima quando a última nota fecha',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedFiveStopTrip(database)
        const secondDocumentId = await seedExtraDocument(database, world.company, world.trip, {
          separationStatus: 'loaded',
          stopId: world.trip.stopId,
        })

        const first = await deliver(world, world.trip.documentId, 'note-one')
        const second = await deliver(world, secondDocumentId, 'note-two')

        expect(first.stopCompleted).toBe(false)
        expect(first.nextStop).toBeNull()
        expect(second.stopCompleted).toBe(true)
        expect(second.nextStop?.sequence).toBe(4)
      })
    },
  )

  testWithPostgres('a baixa do escritório não devolve a próxima parada', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedFiveStopTrip(database)
      const target = await resolveFieldTripTarget({
        companyId: world.company.companyId,
        repository: new DrizzleFieldTripTargetRepository(database.db),
        target: { kind: 'trip', tripId: world.trip.tripId },
      })

      const result = await reportDocumentDelivery({
        actorUserId: world.company.userId,
        companyId: world.company.companyId,
        documentId: world.trip.documentId,
        idempotencyKey: 'office-close',
        location: null,
        now: new Date(Date.now() - 60_000),
        target,
        unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket'),
      })

      expect(result.stopCompleted).toBe(true)
      expect(result.nextStop).toBeNull()
    })
  })

  testWithPostgres(
    'o snapshot do motorista mostra a precisão e a confiança de cada parada',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedFiveStopTrip(database)
        await seedCoordinate({ database, precision: 'street', stopId: world.trip.stopId })
        const repository = new DrizzleCurrentDriverTripRepository(database.db)

        const trips = await repository.listActiveTrips({
          companyId: world.company.companyId,
          driverId: world.company.firstDriverId,
        })
        const stops = trips.flatMap((trip) => trip.stops)
        const withCoordinate = stops.find((stop) => stop.id === world.trip.stopId)
        const withoutCoordinate = stops.find((stop) => stop.sequence === 4)

        expect(withCoordinate).toMatchObject({ isAddressReliable: true, precision: 'street' })
        expect(withoutCoordinate).toMatchObject({ isAddressReliable: false, precision: null })
      })
    },
  )
})
