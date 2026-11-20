/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 (emenda de 19/11/2026), contra Postgres real: a nota NÃO entregue com canhoto retido aberto (coleta
 * `pending`) é livre para outra viagem. Entrar noutra viagem (lote ou acréscimo à viagem que saiu) a solta da origem,
 * cria o vínculo novo e leva a coleta junto; a nota entregue ou com a coleta já encaixada não se move; a listagem de
 * notas diz `canhotoRetained` só para a que pode se mover.
 */
import { describe, expect, test } from 'bun:test'
import type { DrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import {
  tripCanhotoPickups,
  tripDocumentOccurrences,
  tripDocuments,
  trips,
} from '../../src/database/trip.schema.js'
import {
  createPendingCanhotoPickup,
  listMovableCanhotoRetainedLinks,
} from '../../src/trips/infrastructure/canhoto-pickup.query.js'
import { DrizzleNfeDocumentRepository } from '../../src/nfe-documents/infrastructure/drizzle-nfe-document.repository.js'
import type { NfeStorageGateway } from '../../src/storage/infrastructure/nfe-storage-gateway.js'
import { saveOccurrenceType } from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import {
  seedOnRoadTrip,
  useSharedRaceDatabase,
  type CrewTransferWorld,
} from '../fixtures/trip-crew-transfer.fixture.js'
import { seedNfeDocument } from '../fixtures/trip-dispatch-race.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test
const TEST_TIMEOUT_MS = 60_000

const raceDatabase = useSharedRaceDatabase(databaseUrl)

function db(): DrizzleProvider {
  return raceDatabase().database
}

type Retained = Readonly<{ nfeDocumentId: string; originDocumentId: string; pickupId: string }>

/** Uma nota nova na viagem de origem, com a ocorrência e a coleta `pending` (o que o registro do tipo grava). */
async function seedRetainedNote(world: CrewTransferWorld): Promise<Retained> {
  const nfeDocumentId = await seedNfeDocument(world.database, {
    companyId: world.trip.companyId,
    userId: world.trip.userId,
  })
  await world.repository.linkDocumentsAfterDispatch({
    actorUserId: world.trip.userId,
    channel: 'backoffice',
    companyId: world.trip.companyId,
    correlationId: `correlation-${crypto.randomUUID()}`,
    ipAddress: '203.0.113.7',
    nfeDocumentIds: [nfeDocumentId],
    reason: 'nota para o teste do canhoto retido',
    tripId: world.trip.tripId,
  })
  const [origin] = await world.database.db
    .select({ id: tripDocuments.id })
    .from(tripDocuments)
    .where(
      and(
        eq(tripDocuments.tripId, world.trip.tripId),
        eq(tripDocuments.nfeDocumentId, nfeDocumentId),
      ),
    )
  if (origin === undefined) throw new Error('EXPECTED_ORIGIN_LINK')
  const type = await saveOccurrenceType(world.database.db, {
    active: true,
    allowsMultipleItems: false,
    blocksContractorNotice: true,
    companyId: world.trip.companyId,
    countsCargoOnPickupTrip: false,
    createsCanhotoPickup: true,
    duplicateRequestPolicy: 'until_resolved',
    emailTemplateKey: null,
    moments: ['document', 'office'],
    name: `Canhoto retido ${crypto.randomUUID().slice(0, 8)}`,
    notifies: false,
    occurrenceTypeId: null,
    stage: 'delivery',
  })
  const [occurrence] = await world.database.db
    .insert(tripDocumentOccurrences)
    .values({
      actorUserId: world.trip.userId,
      companyId: world.trip.companyId,
      note: 'cliente segurou o canhoto',
      occurrenceTypeId: type.id,
      productCode: '',
      stage: 'delivery',
      tripDocumentId: origin.id,
    })
    .returning({ id: tripDocumentOccurrences.id })
  if (occurrence === undefined) throw new Error('EXPECTED_OCCURRENCE')
  const pickupId = await createPendingCanhotoPickup(world.database.db, {
    companyId: world.trip.companyId,
    occurrenceId: occurrence.id,
    originTripDocumentId: origin.id,
  })
  if (pickupId === null) throw new Error('EXPECTED_PICKUP')
  return { nfeDocumentId, originDocumentId: origin.id, pickupId }
}

async function seedTargetTrip(
  world: CrewTransferWorld,
  status: 'draft' | 'in_transit',
): Promise<string> {
  const tripId = crypto.randomUUID()
  await world.database.db
    .insert(trips)
    .values({ companyId: world.trip.companyId, id: tripId, status })
  return tripId
}

async function readLink(world: CrewTransferWorld, id: string) {
  const [row] = await world.database.db.select().from(tripDocuments).where(eq(tripDocuments.id, id))
  return row
}

async function readPickup(world: CrewTransferWorld, id: string) {
  const [row] = await world.database.db
    .select()
    .from(tripCanhotoPickups)
    .where(eq(tripCanhotoPickups.id, id))
  return row
}

async function liveLinkOf(world: CrewTransferWorld, tripId: string, nfeDocumentId: string) {
  const [row] = await world.database.db
    .select()
    .from(tripDocuments)
    .where(and(eq(tripDocuments.tripId, tripId), eq(tripDocuments.nfeDocumentId, nfeDocumentId)))
  return row
}

describe('a nota com canhoto retido fica livre para outra viagem (spec 321, emenda)', () => {
  testWithPostgres(
    'a consulta só devolve a nota não entregue com coleta pending, em viagem diferente da pedida',
    async () => {
      const world = await seedOnRoadTrip(db())
      const retained = await seedRetainedNote(world)

      const query = {
        companyId: world.trip.companyId,
        nfeDocumentIds: [retained.nfeDocumentId],
      }
      expect(await listMovableCanhotoRetainedLinks(world.database.db, query)).toHaveLength(1)
      expect(
        await listMovableCanhotoRetainedLinks(world.database.db, {
          ...query,
          excludeTripId: world.trip.tripId,
        }),
      ).toHaveLength(0)

      await world.database.db
        .update(tripDocuments)
        .set({ deliveredAt: new Date() })
        .where(eq(tripDocuments.id, retained.originDocumentId))
      expect(await listMovableCanhotoRetainedLinks(world.database.db, query)).toHaveLength(0)
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'lote: a nota sai da origem, entra na viagem nova e a coleta a acompanha',
    async () => {
      const world = await seedOnRoadTrip(db())
      const retained = await seedRetainedNote(world)
      const targetTripId = await seedTargetTrip(world, 'draft')

      const result = await world.repository.linkDocumentsBatch({
        actorUserId: world.trip.userId,
        companyId: world.trip.companyId,
        nfeDocumentIds: [retained.nfeDocumentId],
        tripId: targetTripId,
      })

      expect(result.linked.map((document) => document.nfeDocumentId)).toEqual([
        retained.nfeDocumentId,
      ])
      expect((await readLink(world, retained.originDocumentId))?.releasedAt).toBeInstanceOf(Date)
      const live = await liveLinkOf(world, targetTripId, retained.nfeDocumentId)
      expect(live?.releasedAt).toBeNull()
      const pickup = await readPickup(world, retained.pickupId)
      expect(pickup?.status).toBe('pending')
      expect(pickup?.originTripDocumentId).toBe(live?.id)
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'lote sem o ator não move: segue already_linked, como antes',
    async () => {
      const world = await seedOnRoadTrip(db())
      const retained = await seedRetainedNote(world)
      const targetTripId = await seedTargetTrip(world, 'draft')

      const result = await world.repository.linkDocumentsBatch({
        companyId: world.trip.companyId,
        nfeDocumentIds: [retained.nfeDocumentId],
        tripId: targetTripId,
      })

      expect(result.linked).toEqual([])
      expect(result.skipped).toEqual([
        { nfeDocumentId: retained.nfeDocumentId, reason: 'already_linked' },
      ])
      expect((await readLink(world, retained.originDocumentId))?.releasedAt).toBeNull()
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'acréscimo à viagem que saiu: a nota vem da origem e a coleta aponta para o vínculo vivo',
    async () => {
      const world = await seedOnRoadTrip(db())
      const retained = await seedRetainedNote(world)
      const targetTripId = await seedTargetTrip(world, 'in_transit')

      const result = await world.repository.linkDocumentsAfterDispatch({
        actorUserId: world.trip.userId,
        channel: 'backoffice',
        companyId: world.trip.companyId,
        correlationId: `correlation-${crypto.randomUUID()}`,
        ipAddress: '203.0.113.7',
        nfeDocumentIds: [retained.nfeDocumentId],
        reason: 'outro motorista busca o canhoto',
        tripId: targetTripId,
      })

      expect(result?.linked).toHaveLength(1)
      expect((await readLink(world, retained.originDocumentId))?.releasedAt).toBeInstanceOf(Date)
      const live = await liveLinkOf(world, targetTripId, retained.nfeDocumentId)
      expect(live?.releasedAt).toBeNull()
      expect((await readPickup(world, retained.pickupId))?.originTripDocumentId).toBe(live?.id)
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'nota entregue com canhoto retido não se move (D3 segue valendo)',
    async () => {
      const world = await seedOnRoadTrip(db())
      const retained = await seedRetainedNote(world)
      await world.database.db
        .update(tripDocuments)
        .set({ deliveredAt: new Date() })
        .where(eq(tripDocuments.id, retained.originDocumentId))
      const targetTripId = await seedTargetTrip(world, 'draft')

      const result = await world.repository.linkDocumentsBatch({
        actorUserId: world.trip.userId,
        companyId: world.trip.companyId,
        nfeDocumentIds: [retained.nfeDocumentId],
        tripId: targetTripId,
      })

      expect(result.linked).toEqual([])
      expect((await readLink(world, retained.originDocumentId))?.releasedAt).toBeNull()
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'a listagem de notas marca canhotoRetained só na nota que pode se mover',
    async () => {
      const world = await seedOnRoadTrip(db())
      const retained = await seedRetainedNote(world)
      const plain = await seedNfeDocument(world.database, {
        companyId: world.trip.companyId,
        userId: world.trip.userId,
      })
      const repository = new DrizzleNfeDocumentRepository(
        world.database.db,
        {} as NfeStorageGateway,
      )
      const context = { companyId: world.trip.companyId } as never

      const page = await repository.list({ accessKey: null, context, cursor: null, limit: 100 })

      const byId = new Map(page.items.map((item) => [item.id, item]))
      expect(byId.get(retained.nfeDocumentId)?.canhotoRetained).toBe(true)
      expect(byId.get(retained.nfeDocumentId)?.tripId).toBe(world.trip.tripId)
      expect(byId.get(plain)?.canhotoRetained).toBe(false)
    },
    TEST_TIMEOUT_MS,
  )
})
