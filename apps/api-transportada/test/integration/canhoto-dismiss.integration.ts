/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T5d, contra o Postgres: "Descartar" o alerta de canhoto de outra nota e a linha
 * `canhotoOtherDocument` de `/pendencias`. O SQL da fila é uma segunda implementação de
 * `compareCanhotoReading`: o teste de paridade prende as duas em todos os casos da D4.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { companyDeliveryProofSettings } from '../../src/database/company-delivery-proof-settings.schema.js'
import { auditLogs } from '../../src/database/database.schema.js'
import { nfeDocuments } from '../../src/database/nfe.schema.js'
import { tripDeliveryProofs, tripDocuments } from '../../src/database/trip.schema.js'
import { attachDeliveryProof } from '../../src/trips/application/attach-delivery-proof.use-case.js'
import { readDeliveryProofsByTrip } from '../../src/trips/application/read-delivery-proof.use-case.js'
import { createCanhotoOtherDocumentPendingItemSource } from '../../src/pending-items/infrastructure/drizzle-canhoto-other-document-pending-item.source.js'
import { dismissCanhotoMismatch } from '../../src/trips/application/dismiss-canhoto-mismatch.use-case.js'
import { compareCanhotoReading } from '../../src/trips/domain/canhoto-mismatch.policy.js'
import { reportDocumentDelivery } from '../../src/trips/application/report-document-delivery.use-case.js'
import { findDeliveryProofsByTrip } from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleCanhotoDismissUnitOfWork } from '../../src/trips/infrastructure/drizzle-canhoto-dismiss.repository.js'
import { DrizzleDeliveryProofRepository } from '../../src/trips/infrastructure/drizzle-delivery-proof.repository.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { parseDeliveryProofUpload } from '../../src/trips/presentation/delivery-proof.schema.js'
import {
  FAKE_ENVELOPE,
  JPEG_BYTES,
  linkDriverMembership,
  seedCompany,
  seedExtraDocument,
  seedStopArrival,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
  type Company,
  type SeededTrip,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const TEST_BUCKET = 'test-bucket'
const NUMBER_A = '931988'
const NUMBER_B = '172195'

type World = Readonly<{
  actorUserId: string
  company: Company
  documentA: string
  documentB: string
  nfeB: string
  trip: SeededTrip
}>

const signedDownloads = {
  createDownloadUrl: async ({ objectKey }: { readonly objectKey: string }) => ({
    expiresAt: '2026-11-22T12:05:00.000Z',
    url: `https://signed.example/${objectKey}`,
  }),
}

async function nfeOf(database: TestDatabase, tripDocumentId: string): Promise<string> {
  const [row] = await database.db
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocuments)
    .where(eq(tripDocuments.id, tripDocumentId))
  if (!row?.nfeDocumentId) throw new Error('vínculo sem nota')
  return row.nfeDocumentId
}

async function setNumber(database: TestDatabase, nfeDocumentId: string, number: string) {
  await database.db.update(nfeDocuments).set({ number }).where(eq(nfeDocuments.id, nfeDocumentId))
}

async function deliverAndAttachPhoto(
  database: TestDatabase,
  world: Pick<World, 'actorUserId' | 'company'>,
  documentId: string,
): Promise<void> {
  const driver = {
    actorUserId: world.actorUserId,
    companyId: world.company.companyId,
    documentId,
    driverId: world.company.firstDriverId,
  }
  await reportDocumentDelivery({
    ...driver,
    idempotencyKey: `entrega-${crypto.randomUUID()}`,
    location: null,
    now: new Date(),
    unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, TEST_BUCKET),
  })

  const form = new FormData()
  form.set('file', new File([JPEG_BYTES], 'foto.jpg', { type: 'image/jpeg' }))
  form.set('kind', 'photo')
  form.set('attachmentKey', `photo-${crypto.randomUUID()}`)
  const upload = await parseDeliveryProofUpload(
    new Request('http://localhost/me/trips/current/documents/x/proof', {
      body: form,
      method: 'POST',
    }),
  )
  await attachDeliveryProof({
    ...driver,
    newObjectId: () => crypto.randomUUID(),
    newProofId: () => crypto.randomUUID(),
    now: new Date(),
    repository: new DrizzleDeliveryProofRepository(database.db, TEST_BUCKET),
    sealDocument: async () => FAKE_ENVELOPE,
    storage: { store: async () => ({ sha256: crypto.randomUUID().replaceAll('-', '').repeat(2) }) },
    upload,
  })
}

async function readByTrip(database: TestDatabase, world: Pick<World, 'company' | 'trip'>) {
  return readDeliveryProofsByTrip({
    companyId: world.company.companyId,
    downloads: signedDownloads,
    repository: { findByTrip: (query) => findDeliveryProofsByTrip(database.db, query) },
    settings: new DrizzleDeliveryProofRepository(database.db, TEST_BUCKET),
    tripId: world.trip.tripId,
  })
}

async function proofIdOf(
  database: TestDatabase,
  world: Pick<World, 'company' | 'trip'>,
  documentId: string,
): Promise<string> {
  const views = await readByTrip(database, world)
  const view = views.find((item) => item.documentId === documentId)
  if (!view) throw new Error('nota sem comprovante')
  return view.id
}

/** A leitura OCR gravada como a T2 a gravará: `pending`, sem origem e sem instante. */
async function recordOcrReading(
  database: TestDatabase,
  proofId: string,
  reading: Readonly<{ number: string; series: null | string }>,
): Promise<void> {
  await database.db
    .update(tripDeliveryProofs)
    .set({
      canhotoReadNumber: reading.number,
      canhotoReadSeries: reading.series,
      canhotoReadSource: 'ocr',
    })
    .where(eq(tripDeliveryProofs.id, proofId))
}

/** NF 931988 (A) com a foto do canhoto da NF 172195 série 1 (B), as duas na mesma viagem. */
async function seedSwappedCanhoto(database: TestDatabase): Promise<World> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  await seedStopArrival(database, trip, new Date('2026-11-22T08:30:00.000Z'))
  await database.db
    .insert(companyDeliveryProofSettings)
    .values({ companyId: company.companyId, receivedBy: 'optional' })
  const actorUserId = await linkDriverMembership(database, company, company.firstDriverId)
  const documentB = await seedExtraDocument(database, company, trip, {
    separationStatus: 'loaded',
    stopId: trip.stopId,
  })
  await setNumber(database, await nfeOf(database, trip.documentId), NUMBER_A)
  const nfeB = await nfeOf(database, documentB)
  await setNumber(database, nfeB, NUMBER_B)

  const world: World = { actorUserId, company, documentA: trip.documentId, documentB, nfeB, trip }
  await deliverAndAttachPhoto(database, world, world.documentA)
  await recordOcrReading(database, await proofIdOf(database, world, world.documentA), {
    number: `000${NUMBER_B}`,
    series: '1',
  })
  return world
}

function dismiss(database: TestDatabase, world: World, companyId?: string) {
  return dismissCanhotoMismatch({
    actorUserId: world.actorUserId,
    companyId: companyId ?? world.company.companyId,
    correlationId: 'canhoto-dismiss-integration',
    documentId: world.documentA,
    ipAddress: '203.0.113.7',
    tripId: world.trip.tripId,
    unitOfWork: new DrizzleCanhotoDismissUnitOfWork(database.db),
  })
}

function listPending(database: TestDatabase, companyId: string) {
  return createCanhotoOtherDocumentPendingItemSource({ database: database.db }).list({
    companyId,
    cursor: null,
    limit: 50,
  })
}

async function setReading(
  database: TestDatabase,
  proofId: string,
  reading: Readonly<{ number: string; series: null | string }>,
) {
  await database.db
    .update(tripDeliveryProofs)
    .set({ canhotoReadNumber: reading.number, canhotoReadSeries: reading.series })
    .where(eq(tripDeliveryProofs.id, proofId))
}

describe('descartar o alerta de canhoto de outra nota contra o Postgres (spec 344 T5d)', () => {
  testWithPostgres(
    'o alerta some só daquela foto, uma vez, com trilha sem PII; a fila acompanha',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedSwappedCanhoto(database)
        const proofId = await proofIdOf(database, world, world.documentA)

        expect((await readByTrip(database, world))[0]?.canhotoMismatch).toBeDefined()
        const before = await listPending(database, world.company.companyId)
        expect(before.items).toHaveLength(1)
        expect(before.items[0]).toMatchObject({
          entityId: proofId,
          entityType: 'canhotoProof',
          kind: 'canhotoOtherDocument',
          details: {
            documentId: world.documentA,
            movable: 'true',
            targetCanhotoApproved: 'false',
            targetDocumentId: world.documentB,
            targetSameTrip: 'true',
            tripId: world.trip.tripId,
          },
        })

        expect(await dismiss(database, world)).toEqual({
          alreadyDismissed: false,
          documentId: world.documentA,
        })
        expect((await readByTrip(database, world))[0]?.canhotoMismatch).toBeUndefined()
        expect((await listPending(database, world.company.companyId)).items).toHaveLength(0)

        expect((await dismiss(database, world)).alreadyDismissed).toBe(true)
        const trail = await database.db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.action, 'trip.canhoto-mismatch.dismissed'))
        expect(trail).toHaveLength(1)
        expect(trail[0]).toMatchObject({
          actorUserId: world.actorUserId,
          entityId: proofId,
          permission: 'trip.manage',
          targetId: world.trip.tripId,
        })
        expect(JSON.stringify(trail)).not.toContain(NUMBER_A)
        expect(JSON.stringify(trail)).not.toContain(NUMBER_B)
      })
    },
    120_000,
  )

  testWithPostgres(
    'outra empresa não vê a fila nem descarta; foto sem alerta não se descarta',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedSwappedCanhoto(database)
        const otherCompany = await seedCompany(database)

        expect((await listPending(database, otherCompany.companyId)).items).toEqual([])
        await expect(dismiss(database, world, otherCompany.companyId)).rejects.toMatchObject({
          code: 'CANHOTO_REVIEW_PROOF_NOT_FOUND',
        })

        await setReading(database, await proofIdOf(database, world, world.documentA), {
          number: NUMBER_A,
          series: null,
        })
        await expect(dismiss(database, world)).rejects.toMatchObject({
          code: 'CANHOTO_DISMISS_NOT_FLAGGED',
        })
      })
    },
    120_000,
  )

  testWithPostgres(
    'paridade: a fila em SQL lista exatamente o que `compareCanhotoReading` aponta',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedSwappedCanhoto(database)
        const nfeA = await nfeOf(database, world.documentA)
        await database.db.update(nfeDocuments).set({ series: '1' }).where(eq(nfeDocuments.id, nfeA))
        const proofId = await proofIdOf(database, world, world.documentA)

        const cases: readonly { number: string; series: null | string }[] = [
          { number: NUMBER_A, series: null },
          { number: `000${NUMBER_A}`, series: '1' },
          { number: NUMBER_A, series: '001' },
          { number: NUMBER_A, series: '2' },
          { number: NUMBER_B, series: null },
          { number: NUMBER_B, series: '1' },
          { number: '0', series: null },
          { number: '000', series: '0' },
        ]
        for (const reading of cases) {
          await setReading(database, proofId, reading)
          const listed = (await listPending(database, world.company.companyId)).items.length === 1
          const aligned =
            compareCanhotoReading({
              expectedNumber: NUMBER_A,
              expectedSeries: '1',
              readNumber: reading.number,
              readSeries: reading.series,
              review: 'pending',
            }) !== null
          expect({ listed, reading }).toEqual({ listed: aligned, reading })
        }

        // Aprovada: nem lista nem alerta.
        await setReading(database, proofId, { number: NUMBER_B, series: null })
        await database.db
          .update(tripDeliveryProofs)
          .set({
            canhotoReview: 'approved',
            canhotoReviewAt: new Date(),
            canhotoReviewByUserId: world.actorUserId,
            canhotoReviewOrigin: 'manual',
          })
          .where(eq(tripDeliveryProofs.id, proofId))
        expect((await listPending(database, world.company.companyId)).items).toHaveLength(0)
      })
    },
    180_000,
  )
})
