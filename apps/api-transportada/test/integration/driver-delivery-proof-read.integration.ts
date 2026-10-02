/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Pedido do usuário (01/10), contra o Postgres: o motorista relê o canhoto da própria nota, e **só**
 * dela. O recorte é uma consulta (`findDriverReachableDocument`), não um `if` — com dublê, um filtro
 * errado devolveria a nota de qualquer motorista da transportadora e passaria em todo contrato.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { companyDeliveryProofSettings } from '../../src/database/company-delivery-proof-settings.schema.js'
import { fleetDrivers } from '../../src/database/fleet.schema.js'
import { attachDeliveryProof } from '../../src/trips/application/attach-delivery-proof.use-case.js'
import { readDriverDeliveryProofs } from '../../src/trips/application/read-driver-delivery-proof.use-case.js'
import { reportDocumentDelivery } from '../../src/trips/application/report-document-delivery.use-case.js'
import { TripDocumentNotReachableError } from '../../src/trips/domain/trip.error.js'
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
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const TEST_BUCKET = 'test-bucket'

const signedDownloads = {
  createDownloadUrl: async ({ objectKey }: { readonly objectKey: string }) => ({
    expiresAt: '2026-10-01T12:05:00.000Z',
    url: `https://signed.example/${objectKey}`,
  }),
}

function createRepository(database: TestDatabase) {
  return {
    findReachableDocument: (input: Parameters<typeof findDriverReachableDocument>[1]) =>
      findDriverReachableDocument(database.db, input),
    listDeliveryProofs: (input: Parameters<typeof listDeliveryProofs>[1]) =>
      listDeliveryProofs(database.db, input),
  }
}

async function seedDeliveredProof(database: TestDatabase) {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  await seedStopArrival(database, trip, new Date('2026-10-01T08:30:00.000Z'))
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

  const form = new FormData()
  form.set('file', new File([JPEG_BYTES], 'canhoto.jpg', { type: 'image/jpeg' }))
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

  return { company, driver, trip }
}

/** Um motorista cadastrado na mesma empresa, fora da tripulação desta viagem. */
async function seedOutsiderDriver(database: TestDatabase, companyId: string): Promise<string> {
  const id = crypto.randomUUID()
  await database.db
    .insert(fleetDrivers)
    .values({ companyId, id, name: 'Motorista de Fora', taxId: '33344455566' })
  return id
}

describe('o motorista relê o canhoto, contra o Postgres', () => {
  testWithPostgres(
    'a nota da viagem dele devolve as URLs assinadas do original e da miniatura',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredProof(database)

        const proofs = await readDriverDeliveryProofs({
          companyId: world.company.companyId,
          documentId: world.trip.documentId,
          downloads: signedDownloads,
          driverId: world.company.firstDriverId,
          repository: createRepository(database),
        })

        expect(proofs).toHaveLength(1)
        expect(proofs[0]?.kind).toBe('photo')
        expect(proofs[0]?.downloadUrl).toStartWith('https://signed.example/')
        expect(proofs[0]?.thumbnailUrl).toStartWith('https://signed.example/')
        expect(proofs[0]?.thumbnailUrl).not.toBe(proofs[0]?.downloadUrl)
      })
    },
    120_000,
  )

  testWithPostgres(
    'motorista da mesma empresa, fora da viagem, não alcança a nota',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredProof(database)
        const outsiderId = await seedOutsiderDriver(database, world.company.companyId)

        await expect(
          readDriverDeliveryProofs({
            companyId: world.company.companyId,
            documentId: world.trip.documentId,
            downloads: signedDownloads,
            driverId: outsiderId,
            repository: createRepository(database),
          }),
        ).rejects.toBeInstanceOf(TripDocumentNotReachableError)
      })
    },
    120_000,
  )

  testWithPostgres(
    'nota de outra empresa não existe, mesmo com o id em mãos',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredProof(database)
        const neighbour = await seedCompany(database)

        await expect(
          readDriverDeliveryProofs({
            companyId: neighbour.companyId,
            documentId: world.trip.documentId,
            downloads: signedDownloads,
            driverId: neighbour.firstDriverId,
            repository: createRepository(database),
          }),
        ).rejects.toBeInstanceOf(TripDocumentNotReachableError)
      })
    },
    120_000,
  )

  testWithPostgres(
    'entrega sem canhoto é lista vazia, nunca erro',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        await linkDriverMembership(database, company, company.firstDriverId)
        await database.db
          .update(fleetDrivers)
          .set({ name: 'Motorista Um' })
          .where(eq(fleetDrivers.id, company.firstDriverId))

        const proofs = await readDriverDeliveryProofs({
          companyId: company.companyId,
          documentId: trip.documentId,
          downloads: signedDownloads,
          driverId: company.firstDriverId,
          repository: createRepository(database),
        })

        expect(proofs).toEqual([])
      })
    },
    120_000,
  )
})
