/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T3 (CA04), contra o Postgres: o alerta "parece ser da NF X" sai da leitura dos
 * comprovantes da viagem, a NF X é procurada **só na empresa da prova**, a da mesma viagem vence a
 * de outra viagem, e a duplicidade (Q4) lê o canhoto aprovado da NF X. O contrato com dublê não vê
 * o SQL: uma junção sem `company_id` citaria a nota de outra transportadora e passaria nele.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { companyDeliveryProofSettings } from '../../src/database/company-delivery-proof-settings.schema.js'
import { nfeDocuments } from '../../src/database/nfe.schema.js'
import { tripDeliveryProofs, tripDocuments } from '../../src/database/trip.schema.js'
import { attachDeliveryProof } from '../../src/trips/application/attach-delivery-proof.use-case.js'
import {
  readDeliveryProofs,
  readDeliveryProofsByTrip,
} from '../../src/trips/application/read-delivery-proof.use-case.js'
import { reportDocumentDelivery } from '../../src/trips/application/report-document-delivery.use-case.js'
import {
  findDeliveryProofsByTrip,
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
  seedExtraDocument,
  seedNfeDocument,
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

describe('o alerta de canhoto de outra nota contra o Postgres (spec 344 T3, CA04)', () => {
  testWithPostgres(
    'a prova da NF 931988 com o canhoto da 172195 cita a 172195 da mesma viagem',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedSwappedCanhoto(database)

        const views = await readByTrip(database, world)
        const proofA = views.find((view) => view.documentId === world.documentA)

        expect(proofA?.canhotoReview).toBe('pending')
        expect(proofA?.canhotoMismatch).toEqual({
          kind: 'other_document',
          matchedDocument: {
            canhotoApproved: false,
            nfeDocumentId: world.nfeB,
            number: NUMBER_B,
            sameTrip: true,
            series: '1',
            status: 'authorized',
            tripDocumentId: world.documentB,
            tripId: world.trip.tripId,
          },
          readNumber: NUMBER_B,
          readSeries: '1',
        })

        // A leitura por nota (o comprovante aberto) diz o mesmo.
        const [single] = await readDeliveryProofs({
          companyId: world.company.companyId,
          documentId: world.documentA,
          downloads: signedDownloads,
          repository: { listDeliveryProofs: (query) => listDeliveryProofs(database.db, query) },
          tripId: world.trip.tripId,
        })
        expect(single?.canhotoMismatch?.matchedDocument?.tripDocumentId).toBe(world.documentB)
      })
    },
    120_000,
  )

  testWithPostgres(
    'a NF 172195 de outra empresa nunca é citada; sem nota na empresa, o alerta fica sem citação',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedSwappedCanhoto(database)
        // Tira a 172195 desta empresa e põe uma 172195 noutra transportadora.
        await setNumber(database, world.nfeB, '555555')
        const otherCompany = await seedCompany(database)
        await setNumber(database, await seedNfeDocument(database, otherCompany), NUMBER_B)

        const views = await readByTrip(database, world)
        const proofA = views.find((view) => view.documentId === world.documentA)

        expect(proofA?.canhotoMismatch).toEqual({
          kind: 'other_document',
          matchedDocument: null,
          readNumber: NUMBER_B,
          readSeries: '1',
        })
      })
    },
    120_000,
  )

  testWithPostgres(
    'a 172195 da mesma viagem vence a 172195 de outra viagem da mesma empresa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedSwappedCanhoto(database)
        const otherTrip = await seedTrip(database, world.company, 'in_transit')
        await setNumber(database, await nfeOf(database, otherTrip.documentId), NUMBER_B)

        const views = await readByTrip(database, world)
        const matched = views.find((view) => view.documentId === world.documentA)?.canhotoMismatch
          ?.matchedDocument

        expect(matched?.nfeDocumentId).toBe(world.nfeB)
        expect(matched?.sameTrip).toBe(true)
      })
    },
    120_000,
  )

  testWithPostgres(
    'fora da viagem a nota é citada com o vínculo vivo dela, sem sameTrip',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedSwappedCanhoto(database)
        await setNumber(database, world.nfeB, '555555')
        const otherTrip = await seedTrip(database, world.company, 'in_transit')
        const nfeElsewhere = await nfeOf(database, otherTrip.documentId)
        await setNumber(database, nfeElsewhere, NUMBER_B)

        const views = await readByTrip(database, world)
        const matched = views.find((view) => view.documentId === world.documentA)?.canhotoMismatch
          ?.matchedDocument

        expect(matched).toMatchObject({
          nfeDocumentId: nfeElsewhere,
          sameTrip: false,
          tripDocumentId: otherTrip.documentId,
          tripId: otherTrip.tripId,
        })
      })
    },
    120_000,
  )

  testWithPostgres(
    'duplicidade (Q4): a NF 172195 já tem canhoto aprovado',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedSwappedCanhoto(database)
        await deliverAndAttachPhoto(database, world, world.documentB)
        await database.db
          .update(tripDeliveryProofs)
          .set({
            canhotoReview: 'approved',
            canhotoReviewAt: new Date(),
            canhotoReviewByUserId: world.actorUserId,
            canhotoReviewOrigin: 'manual',
          })
          .where(eq(tripDeliveryProofs.id, await proofIdOf(database, world, world.documentB)))

        const views = await readByTrip(database, world)
        const proofA = views.find((view) => view.documentId === world.documentA)
        const proofB = views.find((view) => view.documentId === world.documentB)

        expect(proofA?.canhotoMismatch?.matchedDocument?.canhotoApproved).toBe(true)
        expect(proofB?.canhotoMismatch).toBeUndefined()
      })
    },
    120_000,
  )

  testWithPostgres(
    'leitura que confere, prova sem leitura e prova aprovada: nenhum alerta',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedSwappedCanhoto(database)
        const proofA = await proofIdOf(database, world, world.documentA)

        await recordOcrReading(database, proofA, { number: NUMBER_A, series: null })
        expect(
          (await readByTrip(database, world)).find((view) => view.id === proofA)?.canhotoMismatch,
        ).toBeUndefined()

        await database.db
          .update(tripDeliveryProofs)
          .set({ canhotoReadNumber: null, canhotoReadSeries: null, canhotoReadSource: null })
          .where(eq(tripDeliveryProofs.id, proofA))
        expect(
          (await readByTrip(database, world)).find((view) => view.id === proofA)?.canhotoMismatch,
        ).toBeUndefined()

        await recordOcrReading(database, proofA, { number: NUMBER_B, series: '1' })
        await database.db
          .update(tripDeliveryProofs)
          .set({
            canhotoReview: 'approved',
            canhotoReviewAt: new Date(),
            canhotoReviewByUserId: world.actorUserId,
            canhotoReviewOrigin: 'manual',
          })
          .where(eq(tripDeliveryProofs.id, proofA))
        expect(
          (await readByTrip(database, world)).find((view) => view.id === proofA)?.canhotoMismatch,
        ).toBeUndefined()
      })
    },
    120_000,
  )

  testWithPostgres(
    'mesmo número, série lida diferente: outra série, citando a 931988 série 2 da empresa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedSwappedCanhoto(database)
        const proofA = await proofIdOf(database, world, world.documentA)
        await recordOcrReading(database, proofA, { number: NUMBER_A, series: '2' })
        const seriesTwo = await seedNfeDocument(database, world.company)
        await database.db
          .update(nfeDocuments)
          .set({ number: NUMBER_A, series: '2' })
          .where(eq(nfeDocuments.id, seriesTwo))

        const mismatch = (await readByTrip(database, world)).find(
          (view) => view.id === proofA,
        )?.canhotoMismatch

        expect(mismatch?.kind).toBe('other_series')
        expect(mismatch?.matchedDocument).toMatchObject({
          nfeDocumentId: seriesTwo,
          series: '2',
          tripId: null,
        })
      })
    },
    120_000,
  )
})
