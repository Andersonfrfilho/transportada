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
import { eq } from 'drizzle-orm'

import { companyDeliveryProofSettings } from '../../src/database/company-delivery-proof-settings.schema.js'
import { tripDeliveryProofs } from '../../src/database/trip.schema.js'
import { attachDeliveryProof } from '../../src/trips/application/attach-delivery-proof.use-case.js'
import { reportDocumentDelivery } from '../../src/trips/application/report-document-delivery.use-case.js'
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

describe('a conferência do canhoto contra o Postgres (spec 220 RF24)', () => {
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
})
