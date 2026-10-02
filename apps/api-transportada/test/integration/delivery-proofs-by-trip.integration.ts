/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 T1.6 (CA01), contra o Postgres: a leitura dos comprovantes **da viagem** devolve as três
 * notas numa chamada, cada item com o `documentId` certo, e só as da viagem pedida na empresa do
 * contexto. O contrato com dublê não enxerga o SQL: um `inArray` ou uma junção sem `company_id`
 * devolveria o comprovante de outra nota (ou de outra empresa) e passaria em todos eles.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { companyDeliveryProofSettings } from '../../src/database/company-delivery-proof-settings.schema.js'
import { attachDeliveryProof } from '../../src/trips/application/attach-delivery-proof.use-case.js'
import { readDeliveryProofsByTrip } from '../../src/trips/application/read-delivery-proof.use-case.js'
import { reportDocumentDelivery } from '../../src/trips/application/report-document-delivery.use-case.js'
import { findDeliveryProofsByTrip } from '../../src/trips/infrastructure/delivery-proof-read.support.js'
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
const EXTRA_DOCUMENTS_PER_TRIP = 2

type World = Readonly<{
  actorUserId: string
  company: Company
  documentIds: readonly string[]
  trip: SeededTrip
}>

/** Uma viagem com três notas no mesmo ponto, as três entregues e cada uma com a foto do canhoto. */
async function seedTripWithThreeProofs(database: TestDatabase): Promise<World> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  await seedStopArrival(database, trip, new Date('2026-09-18T08:30:00.000Z'))
  await database.db
    .insert(companyDeliveryProofSettings)
    .values({ companyId: company.companyId, receivedBy: 'optional' })
  const actorUserId = await linkDriverMembership(database, company, company.firstDriverId)
  const extraDocumentIds = await Promise.all(
    Array.from({ length: EXTRA_DOCUMENTS_PER_TRIP }, () =>
      seedExtraDocument(database, company, trip, {
        separationStatus: 'loaded',
        stopId: trip.stopId,
      }),
    ),
  )
  const world: World = {
    actorUserId,
    company,
    documentIds: [trip.documentId, ...extraDocumentIds],
    trip,
  }

  for (const documentId of world.documentIds) {
    await deliverAndAttachPhoto(database, world, documentId)
  }
  return world
}

async function deliverAndAttachPhoto(
  database: TestDatabase,
  world: World,
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
  form.set('thumbnail', new File([JPEG_BYTES], 'miniatura.jpg', { type: 'image/jpeg' }))
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

async function readByTrip(
  database: TestDatabase,
  input: Readonly<{ companyId: string; documentIds?: readonly string[]; tripId: string }>,
) {
  return readDeliveryProofsByTrip({
    ...input,
    downloads: signedDownloads,
    repository: { findByTrip: (query) => findDeliveryProofsByTrip(database.db, query) },
    settings: new DrizzleDeliveryProofRepository(database.db, TEST_BUCKET),
  })
}

describe('os comprovantes da viagem contra o Postgres (spec 222 T1.6, CA01)', () => {
  testWithPostgres(
    'três comprovantes de três notas numa chamada, cada um com o documentId da própria nota',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedTripWithThreeProofs(database)

        const views = await readByTrip(database, {
          companyId: world.company.companyId,
          tripId: world.trip.tripId,
        })

        expect(views).toHaveLength(3)
        expect(views.map((view) => view.documentId).sort()).toEqual([...world.documentIds].sort())
        expect(new Set(views.map((view) => view.id)).size).toBe(3)
        for (const view of views) {
          expect(view.kind).toBe('photo')
          expect(view.downloadUrl).toContain('https://signed.example/')
          expect(view.thumbnailUrl).toContain('https://signed.example/')
        }
      })
    },
    120_000,
  )

  testWithPostgres(
    '?documentIds= recorta: só as notas pedidas voltam',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedTripWithThreeProofs(database)
        const wanted = world.documentIds.slice(0, 2)

        const views = await readByTrip(database, {
          companyId: world.company.companyId,
          documentIds: wanted,
          tripId: world.trip.tripId,
        })

        expect(views.map((view) => view.documentId).sort()).toEqual([...wanted].sort())
      })
    },
    120_000,
  )

  testWithPostgres(
    'a viagem entra no where: nota de outra viagem da mesma empresa não vaza por documentIds',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedTripWithThreeProofs(database)
        const otherTrip = await seedTrip(database, world.company, 'in_transit')
        await seedStopArrival(database, otherTrip, new Date('2026-09-18T08:30:00.000Z'))
        await deliverAndAttachPhoto(database, world, otherTrip.documentId)

        const ofOtherTrip = await readByTrip(database, {
          companyId: world.company.companyId,
          tripId: otherTrip.tripId,
        })
        const askingForForeignDocument = await readByTrip(database, {
          companyId: world.company.companyId,
          documentIds: [otherTrip.documentId],
          tripId: world.trip.tripId,
        })
        const ofThisTrip = await readByTrip(database, {
          companyId: world.company.companyId,
          tripId: world.trip.tripId,
        })

        expect(ofOtherTrip.map((view) => view.documentId)).toEqual([otherTrip.documentId])
        expect(askingForForeignDocument).toEqual([])
        expect(ofThisTrip).toHaveLength(3)
      })
    },
    120_000,
  )

  testWithPostgres(
    'tenant: a empresa do contexto não alcança a viagem de outra, nem pelo id certo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const owner = await seedTripWithThreeProofs(database)
        const stranger = await seedTripWithThreeProofs(database)

        const asStranger = await readByTrip(database, {
          companyId: stranger.company.companyId,
          documentIds: owner.documentIds,
          tripId: owner.trip.tripId,
        })
        const ownerSeen = await readByTrip(database, {
          companyId: owner.company.companyId,
          tripId: owner.trip.tripId,
        })

        expect(asStranger).toEqual([])
        expect(ownerSeen).toHaveLength(3)
      })
    },
    120_000,
  )

  testWithPostgres(
    'viagem sem nenhum comprovante é lista vazia, não erro',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')

        const views = await readByTrip(database, {
          companyId: company.companyId,
          tripId: trip.tripId,
        })

        expect(views).toEqual([])
      })
    },
    120_000,
  )

  testWithPostgres(
    'o raio (spec 227 D6) é o da própria empresa: 500 gravado, 300 de fábrica, e nunca o de outra',
    async () => {
      await withDisposableDatabase(async (database) => {
        const configured = await seedTripWithThreeProofs(database)
        const factory = await seedTripWithThreeProofs(database)
        await database.db
          .update(companyDeliveryProofSettings)
          .set({ proofRadiusMeters: 500 })
          .where(eq(companyDeliveryProofSettings.companyId, configured.company.companyId))
        await database.db
          .delete(companyDeliveryProofSettings)
          .where(eq(companyDeliveryProofSettings.companyId, factory.company.companyId))

        const ofConfigured = await readByTrip(database, {
          companyId: configured.company.companyId,
          tripId: configured.trip.tripId,
        })
        const ofFactory = await readByTrip(database, {
          companyId: factory.company.companyId,
          tripId: factory.trip.tripId,
        })

        expect(ofConfigured.map((view) => view.proofRadiusMeters)).toEqual([500, 500, 500])
        expect(ofFactory.map((view) => view.proofRadiusMeters)).toEqual([300, 300, 300])
      })
    },
    120_000,
  )

  testWithPostgres(
    'tenant do raio: pedir a viagem de outra empresa devolve lista vazia, sem raio nenhum',
    async () => {
      await withDisposableDatabase(async (database) => {
        const owner = await seedTripWithThreeProofs(database)
        const stranger = await seedTripWithThreeProofs(database)
        await database.db
          .update(companyDeliveryProofSettings)
          .set({ proofRadiusMeters: 800 })
          .where(eq(companyDeliveryProofSettings.companyId, stranger.company.companyId))

        const asStranger = await readByTrip(database, {
          companyId: stranger.company.companyId,
          tripId: owner.trip.tripId,
        })

        expect(asStranger).toEqual([])
        expect(JSON.stringify(asStranger)).not.toContain('800')
      })
    },
    120_000,
  )
})
