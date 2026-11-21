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
import { and, eq, sql } from 'drizzle-orm'

import { tripOccurrenceResolutionEvents } from '../../src/database/occurrence-conversation.schema.js'
import { deliveryClients } from '../../src/database/database.schema.js'
import { storedObjects } from '../../src/database/storage.schema.js'
import { deliveryCharges } from '../../src/database/delivery-client.schema.js'
import {
  tripCanhotoPickups,
  tripDocumentOccurrences,
  tripDeliveryProofs,
  tripDocuments,
  tripStopEvents,
  tripStopOccurrences,
  tripStops,
  trips,
} from '../../src/database/trip.schema.js'
import {
  canhotoPickupOnlyDocument,
  createPendingCanhotoPickup,
  isDocumentCanhotoRetainedByNote,
  listMovableCanhotoRetainedLinks,
  loadCanhotoRetainedNfeDocumentIds,
} from '../../src/trips/infrastructure/canhoto-pickup.query.js'
import { settleCanhotoPickupOnProofSaved } from '../../src/trips/infrastructure/canhoto-pickup-settle.support.js'
import { DrizzleDriverFieldReportTransaction } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
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

/** O evento de entrega da nota (como o da baixa do campo), sem foto ainda. */
async function recordDeliveredEvent(world: CrewTransferWorld, documentId: string): Promise<string> {
  const [link] = await world.database.db
    .select({ stopId: tripDocuments.stopId })
    .from(tripDocuments)
    .where(eq(tripDocuments.id, documentId))
  if (link?.stopId === null || link === undefined) throw new Error('EXPECTED_STOP')
  const [event] = await world.database.db
    .insert(tripStopEvents)
    .values({
      actorUserId: world.trip.userId,
      companyId: world.trip.companyId,
      kind: 'delivered',
      stopId: link.stopId,
      tripDocumentId: documentId,
    })
    .returning({ id: tripStopEvents.id })
  if (event === undefined) throw new Error('EXPECTED_EVENT')
  return event.id
}

/** A foto do canhoto gravada no evento de entrega (o que o app, o bot ou o escritório fazem depois da baixa). */
async function addPhotoProof(world: CrewTransferWorld, eventId: string): Promise<void> {
  const objectId = crypto.randomUUID()
  await world.database.db.insert(storedObjects).values({
    bucket: 'test-bucket',
    companyId: world.trip.companyId,
    id: objectId,
    mimeType: 'image/jpeg',
    objectKey: `tenants/test/${objectId}`,
    provider: 's3',
    purpose: 'delivery_proof',
    sha256: objectId.replaceAll('-', '').padEnd(64, '0'),
    sizeBytes: 10n,
    status: 'final',
  })
  await world.database.db.insert(tripDeliveryProofs).values({
    actorUserId: world.trip.userId,
    companyId: world.trip.companyId,
    kind: 'photo',
    objectId,
    stopEventId: eventId,
  })
}

/** A baixa com a foto do canhoto já gravada: é o que fecha a coleta (sem a foto ela segue aberta). */
async function deliverWithPhoto(world: CrewTransferWorld, documentId: string): Promise<void> {
  const eventId = await recordDeliveredEvent(world, documentId)
  await addPhotoProof(world, eventId)
  await deliver(world, documentId)
}

async function deliver(world: CrewTransferWorld, documentId: string): Promise<void> {
  await world.database.db.transaction((transaction) =>
    new DrizzleDriverFieldReportTransaction(transaction, 'test-bucket').markDocumentDelivered({
      at: new Date(),
      companyId: world.trip.companyId,
      documentId,
    }),
  )
}

async function readResolutionEvents(world: CrewTransferWorld, pickupId: string) {
  return world.database.db
    .select({
      actorKind: tripOccurrenceResolutionEvents.actorKind,
      kind: tripOccurrenceResolutionEvents.kind,
    })
    .from(tripOccurrenceResolutionEvents)
    .where(eq(tripOccurrenceResolutionEvents.canhotoPickupId, pickupId))
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
    'avulso: a nota sai da parada que já tem cobrança no recebimento (FK restrict) e entra na viagem nova',
    async () => {
      const world = await seedOnRoadTrip(db())
      const retained = await seedRetainedNote(world)
      const targetTripId = await seedTargetTrip(world, 'draft')
      const companyId = world.trip.companyId
      const origin = await readLink(world, retained.originDocumentId)
      if (origin?.stopId === null || origin?.stopId === undefined) throw new Error('EXPECTED_STOP')
      /** A nota sozinha na parada: sem outra nota viva, sair dela esvazia a parada (o caminho que apagava). */
      const [soloStop] = await world.database.db
        .insert(tripStops)
        .values({
          addressKey: `solo-${crypto.randomUUID()}`,
          companyId,
          label: 'Parada só da nota retida',
          sequence: 99n,
          tripId: world.trip.tripId,
        })
        .returning({ id: tripStops.id })
      if (soloStop === undefined) throw new Error('EXPECTED_SOLO_STOP')
      await world.database.db
        .update(tripDocuments)
        .set({ stopId: soloStop.id })
        .where(eq(tripDocuments.id, retained.originDocumentId))
      const soloStopId = soloStop.id

      /** O que o staging tinha: parada com ocorrência de parada e a cobrança que ela gerou. */
      const stopOccurrenceId = crypto.randomUUID()
      await world.database.db.insert(tripStopOccurrences).values({
        actorUserId: world.trip.userId,
        companyId,
        description: 'Cobrança no recebimento',
        id: stopOccurrenceId,
        kind: 'unexpected_charge',
        stopId: soloStopId,
        tripDocumentId: retained.originDocumentId,
      })
      const deliveryClientId = crypto.randomUUID()
      await world.database.db.insert(deliveryClients).values({
        companyId,
        displayName: 'Cliente da cobrança',
        id: deliveryClientId,
        taxId: '12345678000199',
      })
      await world.database.db.insert(deliveryCharges).values({
        amount: '10.0000',
        chargeType: 'receiving_charge',
        chargedOn: '2026-11-21',
        companyId,
        deliveryClientId,
        origin: 'occurrence',
        status: 'recorded',
        stopOccurrenceId,
        tripDocumentId: retained.originDocumentId,
        tripId: world.trip.tripId,
      })

      const linked = await world.repository.linkDocument({
        actorUserId: world.trip.userId,
        companyId,
        freightCalculationId: null,
        nfeDocumentId: retained.nfeDocumentId,
        tripId: targetTripId,
      })

      expect(linked.tripId).toBe(targetTripId)
      expect((await readLink(world, retained.originDocumentId))?.releasedAt).not.toBeNull()
      const pickup = await readPickup(world, retained.pickupId)
      expect(pickup?.originTripDocumentId).toBe(linked.id)
      /** A parada fica na origem, sem nota, como evidência da cobrança. */
      const [stopAfter] = await world.database.db
        .select({ id: tripStops.id })
        .from(tripStops)
        .where(eq(tripStops.id, soloStopId))
      expect(stopAfter?.id).toBe(soloStopId)
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
    'a nota na viagem nova só pelo canhoto é "só coleta"; a entregue na origem segue carga',
    async () => {
      const world = await seedOnRoadTrip(db())
      const retained = await seedRetainedNote(world)
      const targetTripId = await seedTargetTrip(world, 'draft')
      const onlyPickupIds = async (): Promise<readonly string[]> =>
        (
          await world.database.db
            .select({ id: tripDocuments.id })
            .from(tripDocuments)
            .where(
              and(eq(tripDocuments.companyId, world.trip.companyId), canhotoPickupOnlyDocument()),
            )
        ).map((row) => row.id)

      await world.repository.linkDocumentsBatch({
        actorUserId: world.trip.userId,
        companyId: world.trip.companyId,
        nfeDocumentIds: [retained.nfeDocumentId],
        tripId: targetTripId,
      })
      const live = await liveLinkOf(world, targetTripId, retained.nfeDocumentId)
      expect(await onlyPickupIds()).toContain(live?.id ?? '')

      /** A negação do predicado é o que as leituras de carga usam: nota entregue sem coleta segue contada. */
      const cargoIds = async (): Promise<readonly string[]> =>
        (
          await world.database.db
            .select({ id: tripDocuments.id })
            .from(tripDocuments)
            .where(
              and(
                eq(tripDocuments.companyId, world.trip.companyId),
                sql`not ${canhotoPickupOnlyDocument()}`,
              ),
            )
        ).map((row) => row.id)
      expect(await cargoIds()).not.toContain(live?.id ?? '')

      await world.database.db
        .update(tripDocuments)
        .set({ deliveredAt: new Date() })
        .where(eq(tripDocuments.id, live?.id ?? ''))
      expect(await onlyPickupIds()).not.toContain(live?.id ?? '')
      expect(await cargoIds()).toContain(live?.id ?? '')
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

  testWithPostgres(
    'o mesmo motorista entrega na origem: a marca sai sozinha e a ocorrência resolve',
    async () => {
      const world = await seedOnRoadTrip(db())
      const retained = await seedRetainedNote(world)

      await deliverWithPhoto(world, retained.originDocumentId)

      const pickup = await readPickup(world, retained.pickupId)
      expect(pickup?.status).toBe('collected')
      expect(pickup?.collectedAt).toBeInstanceOf(Date)
      expect(await readResolutionEvents(world, retained.pickupId)).toEqual([
        { actorKind: 'system', kind: 'resolved' },
      ])
      expect(
        await listMovableCanhotoRetainedLinks(world.database.db, {
          companyId: world.trip.companyId,
          nfeDocumentIds: [retained.nfeDocumentId],
        }),
      ).toHaveLength(0)
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'o outro motorista entrega pelo vínculo novo: a marca sai sozinha',
    async () => {
      const world = await seedOnRoadTrip(db())
      const retained = await seedRetainedNote(world)
      const targetTripId = await seedTargetTrip(world, 'in_transit')
      await world.repository.linkDocumentsAfterDispatch({
        actorUserId: world.trip.userId,
        channel: 'backoffice',
        companyId: world.trip.companyId,
        correlationId: `correlation-${crypto.randomUUID()}`,
        ipAddress: '203.0.113.7',
        nfeDocumentIds: [retained.nfeDocumentId],
        reason: 'outro motorista busca o canhoto',
        tripId: targetTripId,
      })
      const live = await liveLinkOf(world, targetTripId, retained.nfeDocumentId)
      if (live === undefined) throw new Error('EXPECTED_LIVE_LINK')

      await deliverWithPhoto(world, live.id)

      expect((await readPickup(world, retained.pickupId))?.status).toBe('collected')
      expect(await readResolutionEvents(world, retained.pickupId)).toEqual([
        { actorKind: 'system', kind: 'resolved' },
      ])
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'a entrega de outra nota não mexe na coleta aberta',
    async () => {
      const world = await seedOnRoadTrip(db())
      const retained = await seedRetainedNote(world)
      const other = await seedRetainedNote(world)

      await deliverWithPhoto(world, other.originDocumentId)

      expect((await readPickup(world, retained.pickupId))?.status).toBe('pending')
      expect((await readPickup(world, other.pickupId))?.status).toBe('collected')
    },
    TEST_TIMEOUT_MS,
  )
})

describe('canhoto retido exige a foto na entrega da nota (21/11/2026)', () => {
  testWithPostgres(
    'a nota (e a NF-e) com coleta aberta é retida; coletada ou cancelada deixa de ser',
    async () => {
      const world = await seedOnRoadTrip(db())
      const retained = await seedRetainedNote(world)
      const companyId = world.trip.companyId

      expect(
        await isDocumentCanhotoRetainedByNote(world.database.db, {
          companyId,
          documentId: retained.originDocumentId,
        }),
      ).toBe(true)
      const ids = await loadCanhotoRetainedNfeDocumentIds(world.database.db, {
        companyId,
        nfeDocumentIds: [retained.nfeDocumentId, crypto.randomUUID()],
      })
      expect([...ids]).toEqual([retained.nfeDocumentId])

      await world.database.db
        .update(tripCanhotoPickups)
        .set({ collectedAt: new Date(), status: 'collected' })
        .where(eq(tripCanhotoPickups.id, retained.pickupId))
      expect(
        await isDocumentCanhotoRetainedByNote(world.database.db, {
          companyId,
          documentId: retained.originDocumentId,
        }),
      ).toBe(false)
      expect(
        (
          await loadCanhotoRetainedNfeDocumentIds(world.database.db, {
            companyId,
            nfeDocumentIds: [retained.nfeDocumentId],
          })
        ).size,
      ).toBe(0)
    },
    TEST_TIMEOUT_MS,
  )
  testWithPostgres(
    'a baixa sem foto deixa a coleta e a ocorrência abertas; a foto gravada depois as fecha',
    async () => {
      const world = await seedOnRoadTrip(db())
      const retained = await seedRetainedNote(world)

      const eventId = await recordDeliveredEvent(world, retained.originDocumentId)
      await deliver(world, retained.originDocumentId)

      expect((await readPickup(world, retained.pickupId))?.status).toBe('pending')
      expect(await readResolutionEvents(world, retained.pickupId)).toEqual([])

      await addPhotoProof(world, eventId)
      await world.database.db.transaction((transaction) =>
        settleCanhotoPickupOnProofSaved(transaction, {
          at: new Date(),
          companyId: world.trip.companyId,
          eventId,
        }),
      )

      expect((await readPickup(world, retained.pickupId))?.status).toBe('collected')
      expect(await readResolutionEvents(world, retained.pickupId)).toEqual([
        { actorKind: 'system', kind: 'resolved' },
      ])
    },
    TEST_TIMEOUT_MS,
  )
})
