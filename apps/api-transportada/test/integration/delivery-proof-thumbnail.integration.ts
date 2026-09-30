/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 RF17, RF20 (T3.8), contra o Postgres: a miniatura do comprovante grava duas linhas em
 * `stored_objects`, a leitura a junta por `leftJoin` escopado pela empresa, e a FK composta impede
 * apontar para o objeto de outra. Os contratos com dublê não enxergam nada disto: um `leftJoin` com
 * critério errado devolveria miniatura `null` para sempre e passaria em todos eles.
 */
import { describe, expect } from 'bun:test'
import { and, eq, inArray } from 'drizzle-orm'

import { companyDeliveryProofSettings } from '../../src/database/company-delivery-proof-settings.schema.js'
import { storedObjects } from '../../src/database/storage.schema.js'
import { tripDeliveryProofs } from '../../src/database/trip.schema.js'
import { attachDeliveryProof } from '../../src/trips/application/attach-delivery-proof.use-case.js'
import { readDeliveryProofs } from '../../src/trips/application/read-delivery-proof.use-case.js'
import { reportDocumentDelivery } from '../../src/trips/application/report-document-delivery.use-case.js'
import { listDeliveryProofs } from '../../src/trips/infrastructure/delivery-proof-read.support.js'
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
const ORIGINAL_PURPOSE = 'delivery_proof'
const THUMBNAIL_PURPOSE = 'trip_delivery_proof_thumbnail'

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
  await seedStopArrival(database, trip, new Date('2026-09-18T08:30:00.000Z'))
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
  options: Readonly<{ kind: 'cargo' | 'photo'; withThumbnail: boolean }>,
): Promise<{ readonly id: string }> {
  const form = new FormData()
  form.set('file', new File([JPEG_BYTES], 'foto.jpg', { type: 'image/jpeg' }))
  form.set('kind', options.kind)
  form.set('attachmentKey', `${options.kind}-${crypto.randomUUID()}`)
  if (options.withThumbnail) {
    form.set('thumbnail', new File([JPEG_BYTES], 'miniatura.jpg', { type: 'image/jpeg' }))
  }
  const upload = await parseDeliveryProofUpload(
    new Request('http://localhost/me/trips/current/documents/x/proof', {
      body: form,
      method: 'POST',
    }),
  )
  return attachDeliveryProof({
    ...world.driver,
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
    expiresAt: '2026-09-30T12:05:00.000Z',
    url: `https://signed.example/${objectKey}`,
  }),
}

async function readViews(database: TestDatabase, world: DriverWorld) {
  return readDeliveryProofs({
    companyId: world.company.companyId,
    documentId: world.trip.documentId,
    downloads: signedDownloads,
    repository: {
      listDeliveryProofs: (input) => listDeliveryProofs(database.db, input),
    },
    tripId: world.trip.tripId,
  })
}

async function readStoredObjects(database: TestDatabase, companyId: string) {
  return database.db
    .select({
      id: storedObjects.id,
      objectKey: storedObjects.objectKey,
      purpose: storedObjects.purpose,
      retentionUntil: storedObjects.retentionUntil,
    })
    .from(storedObjects)
    .where(
      and(
        eq(storedObjects.companyId, companyId),
        inArray(storedObjects.purpose, [ORIGINAL_PURPOSE, THUMBNAIL_PURPOSE]),
      ),
    )
}

describe('a miniatura do comprovante contra o Postgres (spec 220 RF17, RF20)', () => {
  testWithPostgres(
    'com miniatura: duas linhas em stored_objects, e a leitura devolve thumbnailUrl e downloadUrl',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredWorld(database)
        const proof = await attachProof(database, world, { kind: 'photo', withThumbnail: true })

        const objects = await readStoredObjects(database, world.company.companyId)
        const original = objects.find((object) => object.purpose === ORIGINAL_PURPOSE)
        const thumbnail = objects.find((object) => object.purpose === THUMBNAIL_PURPOSE)
        expect(objects).toHaveLength(2)
        expect(original).toBeDefined()
        expect(thumbnail).toBeDefined()

        const [row] = await database.db
          .select({ thumbnailObjectId: tripDeliveryProofs.thumbnailObjectId })
          .from(tripDeliveryProofs)
          .where(eq(tripDeliveryProofs.id, proof.id))
        expect(row?.thumbnailObjectId).toBe(thumbnail?.id ?? '')

        const [view] = await readViews(database, world)
        expect(view?.downloadUrl).toBe(`https://signed.example/${original?.objectKey}`)
        expect(view?.thumbnailUrl).toBe(`https://signed.example/${thumbnail?.objectKey}`)
      })
    },
    120_000,
  )

  testWithPostgres(
    'sem miniatura: a linha não some do leftJoin, thumbnailUrl é omitido e downloadUrl fica',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredWorld(database)
        await attachProof(database, world, { kind: 'photo', withThumbnail: true })
        await attachProof(database, world, { kind: 'cargo', withThumbnail: false })

        const views = await readViews(database, world)
        const withThumbnail = views.find((view) => view.kind === 'photo')
        const withoutThumbnail = views.find((view) => view.kind === 'cargo')

        expect(views).toHaveLength(2)
        expect(withThumbnail?.thumbnailUrl).toBeDefined()
        expect(withoutThumbnail?.downloadUrl).toContain('https://signed.example/')
        expect(withoutThumbnail).toBeDefined()
        expect('thumbnailUrl' in (withoutThumbnail ?? {})).toBe(false)
      })
    },
    120_000,
  )

  testWithPostgres(
    'tenant: a empresa do token não alcança o comprovante nem a miniatura de outra',
    async () => {
      await withDisposableDatabase(async (database) => {
        const owner = await seedDeliveredWorld(database)
        const stranger = await seedDeliveredWorld(database)
        await attachProof(database, owner, { kind: 'photo', withThumbnail: true })

        const asStranger = await listDeliveryProofs(database.db, {
          companyId: stranger.company.companyId,
          documentId: owner.trip.documentId,
          tripId: owner.trip.tripId,
        })
        const ownerSeen = await listDeliveryProofs(database.db, {
          companyId: owner.company.companyId,
          documentId: owner.trip.documentId,
          tripId: owner.trip.tripId,
        })

        expect(asStranger).toEqual([])
        expect(ownerSeen).toHaveLength(1)
        expect(ownerSeen[0]?.thumbnail).not.toBeNull()
      })
    },
    120_000,
  )

  testWithPostgres(
    'FK composta: não aponta para a miniatura de outra empresa; RESTRICT segura o objeto em uso',
    async () => {
      await withDisposableDatabase(async (database) => {
        const owner = await seedDeliveredWorld(database)
        const stranger = await seedDeliveredWorld(database)
        const ownerProof = await attachProof(database, owner, {
          kind: 'photo',
          withThumbnail: true,
        })
        await attachProof(database, stranger, { kind: 'photo', withThumbnail: true })
        const strangerThumbnail = (
          await readStoredObjects(database, stranger.company.companyId)
        ).find((object) => object.purpose === THUMBNAIL_PURPOSE)
        const ownerThumbnail = (await readStoredObjects(database, owner.company.companyId)).find(
          (object) => object.purpose === THUMBNAIL_PURPOSE,
        )

        await expect(
          (async () => {
            await database.db
              .update(tripDeliveryProofs)
              .set({ thumbnailObjectId: strangerThumbnail?.id ?? '' })
              .where(eq(tripDeliveryProofs.id, ownerProof.id))
          })(),
        ).rejects.toThrow()
        await expect(
          (async () => {
            await database.db
              .delete(storedObjects)
              .where(eq(storedObjects.id, ownerThumbnail?.id ?? ''))
          })(),
        ).rejects.toThrow()

        const [stillLinked] = await database.db
          .select({ thumbnailObjectId: tripDeliveryProofs.thumbnailObjectId })
          .from(tripDeliveryProofs)
          .where(eq(tripDeliveryProofs.id, ownerProof.id))
        expect(stillLinked?.thumbnailObjectId).toBe(ownerThumbnail?.id ?? '')
      })
    },
    120_000,
  )

  testWithPostgres(
    'retention_until da miniatura nasce nulo, igual ao original (decisão T3.2, dívida em SECURITY.md)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredWorld(database)
        await attachProof(database, world, { kind: 'photo', withThumbnail: true })

        const objects = await readStoredObjects(database, world.company.companyId)

        expect(objects).toHaveLength(2)
        expect(objects.map((object) => object.retentionUntil)).toEqual([null, null])
      })
    },
    120_000,
  )
})
