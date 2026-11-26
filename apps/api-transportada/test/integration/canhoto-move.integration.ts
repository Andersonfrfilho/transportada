/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T5b (CA05b), contra o Postgres: mover o comprovante da NF 931988 (A) para a 172195 (B).
 * A foto vai para o evento de entrega de B como `pending`, A fica sem canhoto, a trilha leva só ids,
 * repetir é idempotente, e nada passa por cima de B com foto, de B não entregue ou de outra empresa.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { companyDeliveryProofSettings } from '../../src/database/company-delivery-proof-settings.schema.js'
import { auditLogs } from '../../src/database/database.schema.js'
import { nfeDocuments } from '../../src/database/nfe.schema.js'
import { tripDeliveryProofs, tripDocuments } from '../../src/database/trip.schema.js'
import { attachDeliveryProof } from '../../src/trips/application/attach-delivery-proof.use-case.js'
import { readDeliveryProofsByTrip } from '../../src/trips/application/read-delivery-proof.use-case.js'
import { moveCanhotoProof } from '../../src/trips/application/move-canhoto-proof.use-case.js'
import { reportDocumentDelivery } from '../../src/trips/application/report-document-delivery.use-case.js'
import { findDeliveryProofsByTrip } from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleCanhotoMoveUnitOfWork } from '../../src/trips/infrastructure/drizzle-canhoto-move.repository.js'
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

async function deliverWithoutPhoto(database: TestDatabase, world: World, documentId: string) {
  await reportDocumentDelivery({
    actorUserId: world.actorUserId,
    companyId: world.company.companyId,
    documentId,
    driverId: world.company.firstDriverId,
    idempotencyKey: `entrega-${crypto.randomUUID()}`,
    location: null,
    now: new Date(),
    unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, TEST_BUCKET),
  })
}

function move(
  database: TestDatabase,
  world: World,
  overrides: Partial<{ companyId: string; documentId: string; targetDocumentId: string }> = {},
) {
  return moveCanhotoProof({
    actorUserId: world.actorUserId,
    companyId: overrides.companyId ?? world.company.companyId,
    correlationId: 'canhoto-move-integration',
    documentId: overrides.documentId ?? world.documentA,
    ipAddress: '203.0.113.7',
    reason: 'driver_mistake',
    targetDocumentId: overrides.targetDocumentId ?? world.documentB,
    tripId: world.trip.tripId,
    unitOfWork: new DrizzleCanhotoMoveUnitOfWork(database.db),
  })
}

async function proofDocumentIds(database: TestDatabase, world: World) {
  return (await readByTrip(database, world)).map((view) => view.documentId)
}

describe('mover o canhoto para a NF certa contra o Postgres (spec 344 T5b, CA05b)', () => {
  testWithPostgres(
    'a foto da 931988 passa para a 172195 como pending, a trilha leva só ids, e repetir é idempotente',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedSwappedCanhoto(database)
        await deliverWithoutPhoto(database, world, world.documentB)
        const proofId = await proofIdOf(database, world, world.documentA)

        const result = await move(database, world)

        expect(result.alreadyMoved).toBe(false)
        // Mover não aprova; a leitura que motivou o alerta fica com a prova.
        expect(result.review.canhotoReview).toBe('pending')
        expect(result.review.canhotoReadNumber).toBe(`000${NUMBER_B}`)
        expect(await proofDocumentIds(database, world)).toEqual([world.documentB])
        const views = await readByTrip(database, world)
        expect(views[0]?.id).toBe(proofId)
        // Na 172195 a leitura confere: já não há alerta; a 931988 voltou a "sem canhoto".
        expect(views[0]?.canhotoMismatch).toBeUndefined()

        const trail = await database.db
          .select()
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.companyId, world.company.companyId),
              eq(auditLogs.action, 'trip.canhoto-proof.moved'),
            ),
          )
        expect(trail).toHaveLength(1)
        expect(trail[0]).toMatchObject({
          actorUserId: world.actorUserId,
          entityId: proofId,
          permission: 'trip.manage',
          reason: 'driver_mistake',
          targetId: world.trip.tripId,
        })
        expect(trail[0]?.metadata).toEqual({
          fromDocumentId: world.documentA,
          ipAddress: '203.0.113.7',
          reason: 'driver_mistake',
          toDocumentId: world.documentB,
        })
        expect(JSON.stringify(trail)).not.toContain(NUMBER_A)
        expect(JSON.stringify(trail)).not.toContain(NUMBER_B)

        const again = await move(database, world)
        expect(again.alreadyMoved).toBe(true)
        expect(
          await database.db
            .select({ id: auditLogs.id })
            .from(auditLogs)
            .where(eq(auditLogs.action, 'trip.canhoto-proof.moved')),
        ).toHaveLength(1)
      })
    },
    120_000,
  )

  testWithPostgres(
    'B não entregue ou B com foto de canhoto: 409 e a foto fica onde estava',
    async () => {
      await withDisposableDatabase(async (database) => {
        const notDelivered = await seedSwappedCanhoto(database)
        await expect(move(database, notDelivered)).rejects.toMatchObject({
          code: 'CANHOTO_MOVE_TARGET_NOT_DELIVERED',
        })
        expect(await proofDocumentIds(database, notDelivered)).toEqual([notDelivered.documentA])

        const withPhoto = await seedSwappedCanhoto(database)
        await deliverAndAttachPhoto(database, withPhoto, withPhoto.documentB)
        await expect(move(database, withPhoto)).rejects.toMatchObject({
          code: 'CANHOTO_MOVE_TARGET_HAS_PROOF',
        })
        expect((await proofDocumentIds(database, withPhoto)).toSorted()).toEqual(
          [withPhoto.documentA, withPhoto.documentB].toSorted(),
        )
        expect(
          await database.db
            .select({ id: auditLogs.id })
            .from(auditLogs)
            .where(eq(auditLogs.action, 'trip.canhoto-proof.moved')),
        ).toHaveLength(0)
      })
    },
    120_000,
  )

  testWithPostgres(
    'canhoto aprovado em B, destino que a leitura não cita e outra empresa: nada se move',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedSwappedCanhoto(database)
        await deliverWithoutPhoto(database, world, world.documentB)

        // A leitura aponta para B; pedir outra nota como destino é recusa.
        await expect(
          move(database, world, { targetDocumentId: world.documentA }),
        ).rejects.toMatchObject({ code: 'CANHOTO_MOVE_NOT_FLAGGED_FOR_TARGET' })

        // Outra empresa não enxerga a prova: 404, nunca 403.
        const otherCompany = await seedCompany(database)
        await expect(
          move(database, world, { companyId: otherCompany.companyId }),
        ).rejects.toMatchObject({ code: 'CANHOTO_REVIEW_PROOF_NOT_FOUND' })

        // Prova já aprovada por gente não é movida por cima.
        await database.db
          .update(tripDeliveryProofs)
          .set({
            canhotoReview: 'approved',
            canhotoReviewAt: new Date(),
            canhotoReviewByUserId: world.actorUserId,
            canhotoReviewOrigin: 'manual',
          })
          .where(eq(tripDeliveryProofs.id, await proofIdOf(database, world, world.documentA)))
        await expect(move(database, world)).rejects.toMatchObject({
          code: 'CANHOTO_MOVE_SOURCE_NOT_PENDING',
        })
        expect(await proofDocumentIds(database, world)).toEqual([world.documentA])
      })
    },
    120_000,
  )
})
