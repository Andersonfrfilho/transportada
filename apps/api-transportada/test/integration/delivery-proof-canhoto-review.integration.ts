/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 RF24 (T6.2), contra o Postgres: o canhoto nasce `pending` e a recaptura zera o veredito.
 *
 * Os contratos puros conferem o objeto que o repositório monta; nenhum deles enxerga o que o banco
 * faz com ele. Coluna esquecida no `DO UPDATE SET` não é erro em lugar nenhum — o valor velho
 * simplesmente sobrevive, e o canhoto novo aparece na tela já recusado. Só um `ON CONFLICT` de
 * verdade mostra isso. Os CHECKs da migration também só falham aqui.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { identityUserProfiles } from '../../src/database/identity-user-profile.schema.js'
import { identityUsers, userCompanyMemberships } from '../../src/database/identity.schema.js'
import { companyDeliveryProofSettings } from '../../src/database/company-delivery-proof-settings.schema.js'
import { storedObjects } from '../../src/database/storage.schema.js'
import { tripDeliveryProofs, tripStopEvents } from '../../src/database/trip.schema.js'
import { attachDeliveryProof } from '../../src/trips/application/attach-delivery-proof.use-case.js'
import { reportDocumentDelivery } from '../../src/trips/application/report-document-delivery.use-case.js'
import { listDeliveryProofs } from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleCanhotoReviewUnitOfWork } from '../../src/trips/infrastructure/drizzle-canhoto-review.repository.js'
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
const CANHOTO_KIND = 'photo'
const REVIEWER_USER_ID = '00000000-0000-4000-8000-0000000000aa'
const READ_NUMBER = '000009000'
const READ_SERIES = '001'

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
  kind: 'cargo' | 'photo' | 'signature',
): Promise<{ readonly id: string }> {
  const form = new FormData()
  form.set('file', new File([JPEG_BYTES], 'foto.jpg', { type: 'image/jpeg' }))
  form.set('kind', kind)
  form.set('attachmentKey', `${kind}-${crypto.randomUUID()}`)
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

async function readReview(database: TestDatabase, proofId: string) {
  const [row] = await database.db
    .select({
      canhotoReadDocumentId: tripDeliveryProofs.canhotoReadDocumentId,
      canhotoReadNumber: tripDeliveryProofs.canhotoReadNumber,
      canhotoReadSeries: tripDeliveryProofs.canhotoReadSeries,
      canhotoReadSource: tripDeliveryProofs.canhotoReadSource,
      canhotoReview: tripDeliveryProofs.canhotoReview,
      canhotoReviewAt: tripDeliveryProofs.canhotoReviewAt,
      canhotoReviewByUserId: tripDeliveryProofs.canhotoReviewByUserId,
      canhotoReviewNote: tripDeliveryProofs.canhotoReviewNote,
      canhotoReviewOrigin: tripDeliveryProofs.canhotoReviewOrigin,
      canhotoReviewReason: tripDeliveryProofs.canhotoReviewReason,
    })
    .from(tripDeliveryProofs)
    .where(eq(tripDeliveryProofs.id, proofId))

  return row
}

/** Recusa completa, como a T6.7 vai gravá-la: ator, instante, motivo, e a leitura que a originou. */
async function rejectByHand(database: TestDatabase, proofId: string): Promise<void> {
  await database.db
    .update(tripDeliveryProofs)
    .set({
      canhotoReadNumber: READ_NUMBER,
      canhotoReadSeries: READ_SERIES,
      canhotoReadSource: 'ocr',
      canhotoReview: 'rejected',
      canhotoReviewAt: new Date('2026-09-19T10:00:00.000Z'),
      canhotoReviewByUserId: REVIEWER_USER_ID,
      canhotoReviewOrigin: 'manual',
      canhotoReviewReason: 'illegible',
    })
    .where(eq(tripDeliveryProofs.id, proofId))
}

/** Um evento `returned` da mesma nota, já com um canhoto `photo` — o que o painel listaria ao lado do da entrega. */
async function seedReturnedEventWithCanhoto(
  database: TestDatabase,
  world: DriverWorld,
): Promise<string> {
  const eventId = crypto.randomUUID()
  const objectId = crypto.randomUUID()
  const proofId = crypto.randomUUID()
  await database.db.insert(tripStopEvents).values({
    actorUserId: world.driver.actorUserId,
    companyId: world.company.companyId,
    createdAt: new Date('2099-01-01T00:00:00.000Z'),
    id: eventId,
    kind: 'returned',
    stopId: world.trip.stopId,
    tripDocumentId: world.trip.documentId,
  })
  await database.db.insert(storedObjects).values({
    bucket: TEST_BUCKET,
    companyId: world.company.companyId,
    id: objectId,
    mimeType: 'image/jpeg',
    objectKey: `returned/${objectId}`,
    provider: 's3',
    purpose: 'delivery_proof',
    sha256: 'f'.repeat(64),
    sizeBytes: BigInt(JPEG_BYTES.byteLength),
    status: 'final',
  })
  await database.db.insert(tripDeliveryProofs).values({
    actorUserId: world.driver.actorUserId,
    canhotoReview: 'pending',
    companyId: world.company.companyId,
    id: proofId,
    kind: CANHOTO_KIND,
    objectId,
    stopEventId: eventId,
  })
  return proofId
}

async function seedReviewer(
  database: TestDatabase,
  companyId: string,
  membershipStatus: 'active' | 'disabled',
): Promise<string> {
  const userId = crypto.randomUUID()
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db.insert(identityUserProfiles).values({
    contactAddress: `${userId}@example.com`,
    contactChannel: 'email',
    name: 'Ana Souza',
    userId,
    username: userId,
  })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, status: membershipStatus, userId })
  return userId
}

describe('a conferência do canhoto contra o Postgres (spec 220 RF24)', () => {
  testWithPostgres(
    'a leitura do comprovante devolve o veredito e o nome de quem conferiu, sem multiplicar linhas',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredWorld(database)
        const proof = await attachProof(database, world, CANHOTO_KIND)
        const cargo = await attachProof(database, world, 'cargo')
        const reviewerId = await seedReviewer(database, world.company.companyId, 'active')
        await database.db
          .update(tripDeliveryProofs)
          .set({
            canhotoReadNumber: READ_NUMBER,
            canhotoReadSource: 'ocr',
            canhotoReview: 'approved',
            canhotoReviewAt: new Date('2026-09-19T10:00:00.000Z'),
            canhotoReviewByUserId: reviewerId,
            canhotoReviewOrigin: 'manual',
          })
          .where(eq(tripDeliveryProofs.id, proof.id))

        const records = await listDeliveryProofs(database.db, {
          companyId: world.company.companyId,
          documentId: world.trip.documentId,
          tripId: world.trip.tripId,
        })

        expect(records).toHaveLength(2)
        expect(records.find((record) => record.id === proof.id)).toMatchObject({
          canhotoReadNumber: READ_NUMBER,
          canhotoReadSource: 'ocr',
          canhotoReview: 'approved',
          canhotoReviewAt: '2026-09-19T10:00:00.000Z',
          canhotoReviewByName: 'Ana Souza',
          canhotoReviewOrigin: 'manual',
        })
        expect(records.find((record) => record.id === cargo.id)).toMatchObject({
          canhotoReview: 'not_applicable',
          canhotoReviewByName: null,
        })
      })
    },
    120_000,
  )

  testWithPostgres(
    'quem conferiu e já não é membro ativo da empresa sai sem nome, e o veredito continua',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredWorld(database)
        const proof = await attachProof(database, world, CANHOTO_KIND)
        const reviewerId = await seedReviewer(database, world.company.companyId, 'disabled')
        await database.db
          .update(tripDeliveryProofs)
          .set({
            canhotoReview: 'approved',
            canhotoReviewAt: new Date('2026-09-19T10:00:00.000Z'),
            canhotoReviewByUserId: reviewerId,
            canhotoReviewOrigin: 'manual',
          })
          .where(eq(tripDeliveryProofs.id, proof.id))

        const [record] = await listDeliveryProofs(database.db, {
          companyId: world.company.companyId,
          documentId: world.trip.documentId,
          tripId: world.trip.tripId,
        })

        expect(record).toMatchObject({ canhotoReview: 'approved', canhotoReviewByName: null })
      })
    },
    120_000,
  )

  testWithPostgres(
    'canhoto novo nasce pendente: o INSERT escreve o estado, não herda o default da coluna',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredWorld(database)
        const proof = await attachProof(database, world, CANHOTO_KIND)

        expect((await readReview(database, proof.id))?.canhotoReview).toBe('pending')
      })
    },
    120_000,
  )

  testWithPostgres(
    'assinatura e foto da mercadoria nascem fora da fila — o CHECK por tipo aceita a linha',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredWorld(database)
        const cargo = await attachProof(database, world, 'cargo')
        const signature = await attachProof(database, world, 'signature')

        expect((await readReview(database, cargo.id))?.canhotoReview).toBe('not_applicable')
        expect((await readReview(database, signature.id))?.canhotoReview).toBe('not_applicable')
      })
    },
    120_000,
  )

  testWithPostgres(
    'canhoto recapturado zera a conferência: volta a pendente e não herda o recusado',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredWorld(database)
        const first = await attachProof(database, world, CANHOTO_KIND)
        await rejectByHand(database, first.id)
        expect((await readReview(database, first.id))?.canhotoReview).toBe('rejected')

        const second = await attachProof(database, world, CANHOTO_KIND)
        const review = await readReview(database, second.id)

        expect(second.id).toBe(first.id)
        expect(review).toEqual({
          canhotoReadDocumentId: null,
          canhotoReadNumber: null,
          canhotoReadSeries: null,
          canhotoReadSource: null,
          canhotoReview: 'pending',
          canhotoReviewAt: null,
          canhotoReviewByUserId: null,
          canhotoReviewNote: null,
          canhotoReviewOrigin: null,
          canhotoReviewReason: null,
        })
      })
    },
    120_000,
  )

  testWithPostgres(
    'o retry do mesmo attachmentKey nem chega ao ON CONFLICT: o veredito em curso fica de pé',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredWorld(database)
        const first = await attachProof(database, world, CANHOTO_KIND)
        await rejectByHand(database, first.id)
        const attachmentKey = `${CANHOTO_KIND}-${crypto.randomUUID()}`
        const form = new FormData()
        form.set('file', new File([JPEG_BYTES], 'foto.jpg', { type: 'image/jpeg' }))
        form.set('kind', CANHOTO_KIND)
        form.set('attachmentKey', attachmentKey)
        await database.db
          .update(tripDeliveryProofs)
          .set({ attachmentKey })
          .where(eq(tripDeliveryProofs.id, first.id))

        const retry = await attachDeliveryProof({
          ...world.driver,
          newObjectId: () => crypto.randomUUID(),
          newProofId: () => crypto.randomUUID(),
          now: new Date(),
          repository: new DrizzleDeliveryProofRepository(database.db, TEST_BUCKET),
          sealDocument: async () => FAKE_ENVELOPE,
          storage: { store: async () => ({ sha256: 'e'.repeat(64) }) },
          upload: await parseDeliveryProofUpload(
            new Request('http://localhost/me/trips/current/documents/x/proof', {
              body: form,
              method: 'POST',
            }),
          ),
        })

        expect(retry.id).toBe(first.id)
        expect((await readReview(database, first.id))?.canhotoReview).toBe('rejected')
      })
    },
    120_000,
  )

  testWithPostgres(
    'com dois eventos na mesma nota, a trava cai sempre no canhoto da entrega — nunca no da devolução',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredWorld(database)
        const returnedProofId = await seedReturnedEventWithCanhoto(database, world)
        const delivered = await attachProof(database, world, CANHOTO_KIND)
        const unitOfWork = new DrizzleCanhotoReviewUnitOfWork(database.db)

        for (let attempt = 0; attempt < 5; attempt += 1) {
          const locked = await unitOfWork.execute((transaction) =>
            transaction.lockCanhotoProof({
              companyId: world.company.companyId,
              documentId: world.trip.documentId,
              tripId: world.trip.tripId,
            }),
          )
          expect(locked?.id).toBe(delivered.id)
          expect(locked?.id).not.toBe(returnedProofId)
        }
        const untouched = await database.db
          .select({ id: tripDeliveryProofs.id })
          .from(tripDeliveryProofs)
          .where(and(eq(tripDeliveryProofs.id, returnedProofId)))
        expect(untouched).toHaveLength(1)
      })
    },
    120_000,
  )

  testWithPostgres(
    'duas fotos de mercadoria em paralelo com quatro gravadas: só uma entra, o teto de cinco vale',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredWorld(database)
        for (let saved = 0; saved < 4; saved += 1) await attachProof(database, world, 'cargo')

        const outcomes = await Promise.allSettled([
          attachProof(database, world, 'cargo'),
          attachProof(database, world, 'cargo'),
        ])

        const rows = await database.db
          .select({ id: tripDeliveryProofs.id })
          .from(tripDeliveryProofs)
          .where(eq(tripDeliveryProofs.kind, 'cargo'))
        expect(rows).toHaveLength(5)
        expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
        const rejected = outcomes.find((outcome) => outcome.status === 'rejected')
        expect((rejected as PromiseRejectedResult).reason).toMatchObject({
          code: 'TRIP_DELIVERY_PROOF_CARGO_LIMIT',
        })
      })
    },
    120_000,
  )
})
