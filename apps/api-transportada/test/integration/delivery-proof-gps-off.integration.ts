/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 234 D4c contra o Postgres de verdade: o canal gravado em `trip_stop_events.channel` é o que
 * separa a entrega do motorista sem GPS (conta como longe, em todo cliente) da baixa do escritório,
 * que nunca tem posição e não pune. A foto é do app do motorista nos três casos, sem relógio
 * corrigido (cliente antigo), no lugar e 10 min depois do momento da entrega.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { companyDeliveryProofSettings } from '../../src/database/company-delivery-proof-settings.schema.js'
import {
  TRIP_FIELD_CHANNELS,
  tripDeliveryProofs,
  tripStopEvents,
} from '../../src/database/trip.schema.js'
import { attachDeliveryProof } from '../../src/trips/application/attach-delivery-proof.use-case.js'
import type { ReportedLocation } from '../../src/trips/application/driver-field-report.port.js'
import { reportDocumentDelivery } from '../../src/trips/application/report-document-delivery.use-case.js'
import { DrizzleDeliveryProofRepository } from '../../src/trips/infrastructure/drizzle-delivery-proof.repository.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import {
  FAKE_ENVELOPE,
  fakeContext,
  linkDriverMembership,
  multipartRequest,
  seedCompany,
  seedStopArrival,
  seedTrip,
  testWithPostgres,
  wireRoutes,
  withDisposableDatabase,
  type Company,
  type SeededTrip,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const TEN_MINUTES = 10 * 60 * 1000
const AN_HOUR_AGO = (): Date => new Date(Date.now() - 60 * 60 * 1000)
/** `wireRoutes` grava a baixa do escritório com `recorded_at` fixo em 2026-09-18 13:00. */
const OFFICE_ARRIVED_AT = new Date('2026-09-18T08:30:00.000Z')
const OFFICE_DELIVERED_AT = '2026-09-18T09:00:00.000Z'
const DELIVERY_PLACE = { latitude: '-23.5500000', longitude: '-46.6300000' }

type World = Readonly<{
  company: Company
  database: TestDatabase
  driverUserId: string
  trip: SeededTrip
}>

async function seedWorld(database: TestDatabase, arrivedAt: Date): Promise<World> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  await seedStopArrival(database, trip, arrivedAt)
  await database.db
    .insert(companyDeliveryProofSettings)
    .values({ companyId: company.companyId, photo: 'required' })
  const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)

  return { company, database, driverUserId, trip }
}

function deliverAsDriver(
  world: World,
  input: {
    readonly channel?: typeof TRIP_FIELD_CHANNELS.whatsapp
    readonly location: ReportedLocation | null
  },
) {
  return reportDocumentDelivery({
    actorUserId: world.driverUserId,
    ...(input.channel === undefined ? {} : { channel: input.channel }),
    companyId: world.company.companyId,
    documentId: world.trip.documentId,
    driverId: world.company.firstDriverId,
    idempotencyKey: 'motorista-entrega',
    location: input.location,
    now: new Date(),
    unitOfWork: new DrizzleDriverFieldReportUnitOfWork(world.database.db, 'test-bucket'),
  })
}

async function readDeliveryEvent(world: World) {
  const [event] = await world.database.db
    .select({ channel: tripStopEvents.channel, id: tripStopEvents.id })
    .from(tripStopEvents)
    .where(
      and(
        eq(tripStopEvents.companyId, world.company.companyId),
        eq(tripStopEvents.kind, 'delivered'),
      ),
    )
  if (event === undefined) throw new Error('entrega não gravada')

  return event
}

/** A foto do app do motorista, sem `clockOffsetMs`, no lugar e 10 min depois da entrega. */
async function attachDriverPhotoTenMinutesLater(world: World) {
  const repository = new DrizzleDeliveryProofRepository(world.database.db, 'test-bucket')
  const event = await readDeliveryEvent(world)
  const context = await repository.findDeliveryContext({
    companyId: world.company.companyId,
    eventId: event.id,
  })
  const photoAt = new Date(context.deliveredAt.getTime() + TEN_MINUTES)

  const result = await attachDeliveryProof({
    actorUserId: world.driverUserId,
    companyId: world.company.companyId,
    documentId: world.trip.documentId,
    driverId: world.company.firstDriverId,
    newObjectId: () => crypto.randomUUID(),
    newProofId: () => crypto.randomUUID(),
    now: photoAt,
    repository,
    sealDocument: async () => FAKE_ENVELOPE,
    storage: { store: async () => ({ sha256: 'e'.repeat(64) }) },
    upload: {
      attachmentKey: 'foto-do-motorista',
      bytes: new Uint8Array([1, 2, 3]),
      capturedAt: photoAt,
      kind: 'photo',
      mimeType: 'image/jpeg',
      position: { ...DELIVERY_PLACE, accuracyMeters: 5 },
      receiverDocument: '',
      receiverName: '',
    },
  })
  const [stored] = await world.database.db
    .select({ punctuality: tripDeliveryProofs.punctuality })
    .from(tripDeliveryProofs)
    .where(eq(tripDeliveryProofs.companyId, world.company.companyId))

  return {
    channel: event.channel,
    isDeliveryRecordedByDriver: context.isDeliveryRecordedByDriver,
    punctuality: result.punctuality,
    stored: stored?.punctuality,
  }
}

describe('GPS desligado pune em todo cliente, a baixa do escritório não (spec 234 D4c)', () => {
  testWithPostgres(
    'entrega do app do motorista sem posição: a foto pontual vira away',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, AN_HOUR_AGO())
        await deliverAsDriver(world, { location: null })

        expect(await attachDriverPhotoTenMinutesLater(world)).toEqual({
          channel: 'driver_app',
          isDeliveryRecordedByDriver: true,
          punctuality: 'away',
          stored: 'away',
        })
      })
    },
  )

  testWithPostgres(
    'entrega do app do motorista com posição: a foto no lugar é on_time',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, AN_HOUR_AGO())
        await deliverAsDriver(world, {
          location: {
            ...DELIVERY_PLACE,
            accuracyMeters: '5',
            capturedAt: new Date().toISOString(),
          },
        })

        expect(await attachDriverPhotoTenMinutesLater(world)).toEqual({
          channel: 'driver_app',
          isDeliveryRecordedByDriver: true,
          punctuality: 'on_time',
          stored: 'on_time',
        })
      })
    },
  )

  /** O WhatsApp nunca manda posição: a entrega é do motorista, sem prova de lugar. */
  testWithPostgres('entrega do motorista pelo WhatsApp: a foto pontual vira away', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database, AN_HOUR_AGO())
      await deliverAsDriver(world, { channel: TRIP_FIELD_CHANNELS.whatsapp, location: null })

      expect(await attachDriverPhotoTenMinutesLater(world)).toEqual({
        channel: 'whatsapp',
        isDeliveryRecordedByDriver: true,
        punctuality: 'away',
        stored: 'away',
      })
    })
  })

  testWithPostgres(
    'baixa do escritório sem canhoto (spec 223): a foto do motorista não é punida pela posição',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, OFFICE_ARRIVED_AT)
        const [, , , , deliverRoute] = wireRoutes(database)
        const response = await deliverRoute!.execute({
          context: fakeContext(world.company),
          correlationId: 'integration-correlation-office-delivery-gps-off',
          pathParameters: { documentId: world.trip.documentId, id: world.trip.tripId },
          request: multipartRequest({
            fields: { deliveredAt: OFFICE_DELIVERED_AT },
            idempotencyKey: 'office-delivery-gps-off',
          }),
        })
        expect(response.status).toBe(201)

        expect(await attachDriverPhotoTenMinutesLater(world)).toEqual({
          channel: 'office',
          isDeliveryRecordedByDriver: false,
          punctuality: 'on_time',
          stored: 'on_time',
        })
      })
    },
  )
})
