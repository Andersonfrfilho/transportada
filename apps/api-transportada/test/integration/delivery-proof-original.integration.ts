/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 265 T003/T005 (RF4, RF6, RF7), contra o Postgres: o `original` grava o objeto, a linha `received` e
 * o pedido ao worker **na mesma transação**; o `reduced` não pede nada; a recaptura zera o estado; e as
 * duas leituras dizem o estado. Com dublê o contrato prova a forma do que é gravado — só o banco prova que
 * "mesma transação" é verdade: o teste derruba o outbox com um gatilho e confere que nada ficou.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

import { companyDeliveryProofSettings } from '../../src/database/company-delivery-proof-settings.schema.js'
import { deliveryProofOutbox } from '../../src/database/delivery-proof-outbox.schema.js'
import { storedObjects } from '../../src/database/storage.schema.js'
import { tripDeliveryProofs } from '../../src/database/trip.schema.js'
import { attachDeliveryProof } from '../../src/trips/application/attach-delivery-proof.use-case.js'
import { readDeliveryProofs } from '../../src/trips/application/read-delivery-proof.use-case.js'
import { readDriverDeliveryProofs } from '../../src/trips/application/read-driver-delivery-proof.use-case.js'
import { reportDocumentDelivery } from '../../src/trips/application/report-document-delivery.use-case.js'
import {
  findDriverReachableDocument,
  listDeliveryProofs,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleDeliveryProofRepository } from '../../src/trips/infrastructure/drizzle-delivery-proof.repository.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
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

const TEST_BUCKET = 'test-bucket'
const CORRELATION_ID = 'correlation-265-integration'

type DriverWorld = Readonly<{
  company: Company
  driver: Readonly<{
    actorUserId: string
    companyId: string
    documentId: string
    driverId: string
  }>
  trip: SeededTrip
}>

async function seedDeliveredWorld(database: TestDatabase): Promise<DriverWorld> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  await seedStopArrival(database, trip, new Date('2026-10-14T08:30:00.000Z'))
  await database.db
    .insert(companyDeliveryProofSettings)
    .values({ companyId: company.companyId, receivedBy: 'optional' })
  const actorUserId = await linkDriverMembership(database, company, company.firstDriverId)
  const driver = {
    actorUserId,
    companyId: company.companyId,
    documentId: trip.documentId,
    driverId: company.firstDriverId,
  }
  await reportDocumentDelivery({
    ...driver,
    idempotencyKey: `entrega-${crypto.randomUUID()}`,
    location: null,
    now: new Date(),
    unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, TEST_BUCKET),
  })
  return { company, driver, trip }
}

async function attachProof(
  database: TestDatabase,
  world: DriverWorld,
  options: Readonly<{ attachmentKey?: string; variant: 'original' | 'reduced' }>,
): Promise<{ readonly id: string; readonly processingState: string }> {
  const form = new FormData()
  form.set('file', new File([JPEG_BYTES], 'foto.jpg', { type: 'image/jpeg' }))
  form.set('kind', 'photo')
  form.set('variant', options.variant)
  form.set('attachmentKey', options.attachmentKey ?? `photo-${crypto.randomUUID()}`)
  const upload = await parseDeliveryProofUpload(
    new Request('http://localhost/me/trips/current/documents/x/proof', {
      body: form,
      method: 'POST',
    }),
  )

  return attachDeliveryProof({
    ...world.driver,
    correlationId: CORRELATION_ID,
    newObjectId: () => crypto.randomUUID(),
    newProofId: () => crypto.randomUUID(),
    now: new Date(),
    repository: new DrizzleDeliveryProofRepository(database.db, TEST_BUCKET),
    sealDocument: async () => FAKE_ENVELOPE,
    storage: { store: async () => ({ sha256: 'e'.repeat(64) }) },
    upload,
  })
}

const signedDownloads = {
  createDownloadUrl: async ({ objectKey }: { readonly objectKey: string }) => ({
    expiresAt: '2026-10-14T12:05:00.000Z',
    url: `https://signed.example/${objectKey}`,
  }),
}

async function readProofRow(database: TestDatabase, companyId: string) {
  const [row] = await database.db
    .select({
      id: tripDeliveryProofs.id,
      objectId: tripDeliveryProofs.objectId,
      originalObjectId: tripDeliveryProofs.originalObjectId,
      processingError: tripDeliveryProofs.processingError,
      processingState: tripDeliveryProofs.processingState,
    })
    .from(tripDeliveryProofs)
    .where(eq(tripDeliveryProofs.companyId, companyId))
  return row
}

function readOutbox(database: TestDatabase, companyId: string) {
  return database.db
    .select()
    .from(deliveryProofOutbox)
    .where(eq(deliveryProofOutbox.companyId, companyId))
}

describe('o comprovante original contra o Postgres (spec 265)', () => {
  testWithPostgres(
    'o original grava a linha "received", o objeto e o pedido ao worker, e as leituras dizem o estado',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredWorld(database)

        const attached = await attachProof(database, world, { variant: 'original' })

        expect(attached.processingState).toBe('received')
        const row = await readProofRow(database, world.company.companyId)
        expect(row).toMatchObject({
          id: attached.id,
          processingError: null,
          processingState: 'received',
        })
        expect(row?.originalObjectId).toBe(row?.objectId)

        const outbox = await readOutbox(database, world.company.companyId)
        expect(outbox).toHaveLength(1)
        const [event] = outbox
        expect(event).toMatchObject({
          correlationId: CORRELATION_ID,
          eventType: 'delivery-proof.processing.requested',
          proofId: attached.id,
          publishedAt: null,
        })
        const [object] = await database.db
          .select({ objectKey: storedObjects.objectKey })
          .from(storedObjects)
          .where(
            and(
              eq(storedObjects.companyId, world.company.companyId),
              eq(storedObjects.id, row?.objectId ?? ''),
            ),
          )
        expect(event?.payload).toEqual({
          attachmentKey: expect.stringMatching(/^photo-/u),
          companyId: world.company.companyId,
          objectKey: object?.objectKey,
          proofId: attached.id,
          variant: 'original',
        })

        const office = await readDeliveryProofs({
          companyId: world.company.companyId,
          documentId: world.trip.documentId,
          downloads: signedDownloads,
          repository: { listDeliveryProofs: (input) => listDeliveryProofs(database.db, input) },
          tripId: world.trip.tripId,
        })
        expect(office[0]?.processingState).toBe('received')

        const driver = await readDriverDeliveryProofs({
          companyId: world.company.companyId,
          documentId: world.trip.documentId,
          downloads: signedDownloads,
          driverId: world.company.firstDriverId,
          repository: {
            findReachableDocument: (input) => findDriverReachableDocument(database.db, input),
            listDeliveryProofs: (input) => listDeliveryProofs(database.db, input),
          },
        })
        expect(driver[0]?.processingState).toBe('received')
      })
    },
    120_000,
  )

  testWithPostgres(
    'o reduced não pede nada ao worker: linha sem estado, sem original e sem evento',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredWorld(database)

        const attached = await attachProof(database, world, { variant: 'reduced' })

        expect(attached.processingState).toBe('ready')
        expect(await readProofRow(database, world.company.companyId)).toMatchObject({
          originalObjectId: null,
          processingError: null,
          processingState: null,
        })
        expect(await readOutbox(database, world.company.companyId)).toEqual([])

        const office = await readDeliveryProofs({
          companyId: world.company.companyId,
          documentId: world.trip.documentId,
          downloads: signedDownloads,
          repository: { listDeliveryProofs: (input) => listDeliveryProofs(database.db, input) },
          tripId: world.trip.tripId,
        })
        expect(office[0]).not.toHaveProperty('processingState')
      })
    },
    120_000,
  )

  testWithPostgres(
    'a recaptura reduced por cima de um original zera o estado e o ponteiro do original',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredWorld(database)
        await attachProof(database, world, { variant: 'original' })

        await attachProof(database, world, { variant: 'reduced' })

        expect(await readProofRow(database, world.company.companyId)).toMatchObject({
          originalObjectId: null,
          processingError: null,
          processingState: null,
        })
      })
    },
    120_000,
  )

  testWithPostgres(
    'o reenvio com a mesma chave devolve o estado atual e não grava outro evento (RF7)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredWorld(database)
        const attachmentKey = `photo-${crypto.randomUUID()}`
        const first = await attachProof(database, world, { attachmentKey, variant: 'original' })
        await database.db
          .update(tripDeliveryProofs)
          .set({ processingState: 'processing' })
          .where(eq(tripDeliveryProofs.companyId, world.company.companyId))

        const replay = await attachProof(database, world, { attachmentKey, variant: 'original' })

        expect(replay).toMatchObject({ id: first.id, processingState: 'processing' })
        expect(await readOutbox(database, world.company.companyId)).toHaveLength(1)
      })
    },
    120_000,
  )

  testWithPostgres(
    'o pedido e o comprovante são uma transação só: se o outbox falha, nem a linha nem o objeto ficam',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredWorld(database)
        await database.db.execute(
          sql.raw(`
            create function delivery_proof_outbox_refuse() returns trigger language plpgsql as $$
            begin raise exception 'outbox refused'; end $$
          `),
        )
        await database.db.execute(
          sql.raw(`
            create trigger delivery_proof_outbox_refuse before insert on delivery_proof_outbox
            for each row execute function delivery_proof_outbox_refuse()
          `),
        )

        await expect(attachProof(database, world, { variant: 'original' })).rejects.toThrow()

        expect(await readProofRow(database, world.company.companyId)).toBeUndefined()
        expect(await readOutbox(database, world.company.companyId)).toEqual([])
        const objects = await database.db
          .select({ id: storedObjects.id })
          .from(storedObjects)
          .where(
            and(
              eq(storedObjects.companyId, world.company.companyId),
              eq(storedObjects.purpose, 'delivery_proof'),
            ),
          )
        expect(objects).toEqual([])
      })
    },
    120_000,
  )

  testWithPostgres(
    'o outbox não aceita comprovante de outra empresa (FK composta)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredWorld(database)
        const attached = await attachProof(database, world, { variant: 'original' })
        const neighbour = await seedCompany(database)

        const insertForeignEvent = async (): Promise<void> => {
          await database.db.insert(deliveryProofOutbox).values({
            companyId: neighbour.companyId,
            correlationId: 'x',
            eventType: 'delivery-proof.processing.requested',
            payload: {},
            proofId: attached.id,
          })
        }

        await expect(insertForeignEvent()).rejects.toThrow()
      })
    },
    120_000,
  )
})
