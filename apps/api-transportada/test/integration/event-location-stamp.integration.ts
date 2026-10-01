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
import { eq } from 'drizzle-orm'

import { tripDeliveryProofs, tripStopEvents } from '../../src/database/trip.schema.js'
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
