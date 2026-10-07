/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (T7.2b N2), contra Postgres real: o detalhe da ocorrência publica o requisito EFETIVO do
 * tipo para aquela ocorrência — com as exceções do contratante e do destinatário DA NOTA, resolvidas no
 * servidor —, e `null` na ocorrência de parada. Outra empresa não lê (404 como hoje).
 */
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { contractors, deliveryClients } from '../../src/database/delivery-client.schema.js'
import { nfeParticipants, nfeProducts } from '../../src/database/nfe.schema.js'
import {
  companyOccurrenceTypeContractorOverrides,
  companyOccurrenceTypeRecipientOverrides,
  companyOccurrenceTypes,
  tripDocuments,
} from '../../src/database/trip.schema.js'
import { createReadTripOccurrenceDetailUseCase } from '../../src/trips/application/read-trip-occurrence-detail.use-case.js'
import { TripOccurrenceNotFoundError } from '../../src/trips/domain/trip.error.js'
import { findTripOccurrenceDetail } from '../../src/trips/infrastructure/trip-occurrence-detail.query.js'
import { registerStreetOccurrence } from '../fixtures/street-occurrence-registration.fixture.js'
import {
  seedCompany,
  seedTrip,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const EMITTER_TAX_ID = '30290856000160'
const RECIPIENT_TAX_ID = '12345678000190'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

async function seedWorld(
  database: TestDatabase,
  type: Partial<typeof companyOccurrenceTypes.$inferInsert>,
) {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  const [row] = await database.db
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocuments)
    .where(eq(tripDocuments.id, trip.documentId))
  if (row?.nfeDocumentId === null || row === undefined) throw new Error('Seeded document vanished')
  const documentId = row.nfeDocumentId
  const contractorId = crypto.randomUUID()
  await database.db
    .insert(contractors)
    .values({ companyId: company.companyId, id: contractorId, taxId: EMITTER_TAX_ID })
  await database.db
    .insert(deliveryClients)
    .values({ companyId: company.companyId, taxId: RECIPIENT_TAX_ID })
  await database.db.insert(nfeParticipants).values([
    { companyId: company.companyId, documentId, role: 'emitter', taxId: EMITTER_TAX_ID },
    {
      companyId: company.companyId,
      documentId,
      legalName: 'Destinatário',
      role: 'recipient',
      taxId: RECIPIENT_TAX_ID,
    },
  ])
  await database.db.insert(nfeProducts).values({
    cfop: '5102',
    code: 'P1',
    commercialUnit: 'CX',
    companyId: company.companyId,
    description: 'Biscoito',
    documentId,
    ncm: '19053100',
    ordinal: 1n,
    quantity: '3.0000',
    totalValue: '59.9850',
    unitValue: '19.9950',
  })
  const typeId = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    allowsMultipleItems: true,
    companyId: company.companyId,
    declaredAmountLabel: 'Valor da loja',
    declaredAmountMode: 'required',
    declaredAmountScope: 'item',
    id: typeId,
    itemsMinimumCount: null,
    itemsMode: 'optional',
    name: 'Tipo configurado',
    referenceNumberLabel: 'NFD',
    referenceNumberMode: 'required',
    stage: 'delivery',
    ...type,
  })
  return { company, contractorId, trip, typeId }
}

type World = Awaited<ReturnType<typeof seedWorld>>

async function readRequirements(database: TestDatabase, world: World) {
  const saved = await registerStreetOccurrence(database, {
    attachmentObjectId: null,
    company: world.company,
    items: [{ declaredAmount: '10', productCode: 'P1', quantity: '1' }],
    referenceNumber: 'NFD 1',
    trip: world.trip,
    typeId: world.typeId,
  })
  const detail = await findTripOccurrenceDetail(database.db, {
    companyId: world.company.companyId,
    occurrenceId: saved.id,
  })
  return { detail, saved }
}

describe('o detalhe publica o requisito efetivo do tipo (spec 247 T7.2b N2)', () => {
  testWithPostgres(
    'sem exceção: os modos, o escopo e os rótulos do tipo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, {})

        const { detail } = await readRequirements(database, world)

        expect(detail?.requirements).toEqual({
          declaredAmountLabel: 'Valor da loja',
          declaredAmountMode: 'required',
          declaredAmountScope: 'item',
          itemsMode: 'optional',
          referenceNumberLabel: 'NFD',
          referenceNumberMode: 'required',
        })
      })
    },
    60_000,
  )

  testWithPostgres(
    'exceção do contratante e do destinatário da NOTA vale',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, {})
        await database.db.insert(companyOccurrenceTypeContractorOverrides).values({
          companyId: world.company.companyId,
          contractorId: world.contractorId,
          declaredAmountMode: 'optional',
          occurrenceTypeId: world.typeId,
        })
        await database.db.insert(companyOccurrenceTypeRecipientOverrides).values({
          companyId: world.company.companyId,
          occurrenceTypeId: world.typeId,
          referenceNumberMode: 'off',
          taxId: RECIPIENT_TAX_ID,
        })

        const { detail } = await readRequirements(database, world)

        expect(detail?.requirements).toMatchObject({
          declaredAmountMode: 'optional',
          referenceNumberMode: 'off',
        })
      })
    },
    60_000,
  )

  testWithPostgres(
    'a exceção de Produtos off leva o valor pago de item para a ocorrência',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, {})
        await database.db.insert(companyOccurrenceTypeContractorOverrides).values({
          companyId: world.company.companyId,
          contractorId: world.contractorId,
          itemsMode: 'off',
          occurrenceTypeId: world.typeId,
        })
        const saved = await registerStreetOccurrence(database, {
          attachmentObjectId: null,
          company: world.company,
          declaredAmount: '10',
          referenceNumber: 'NFD 1',
          trip: world.trip,
          typeId: world.typeId,
        })

        const detail = await findTripOccurrenceDetail(database.db, {
          companyId: world.company.companyId,
          occurrenceId: saved.id,
        })

        expect(detail?.requirements).toMatchObject({
          declaredAmountScope: 'occurrence',
          itemsMode: 'off',
        })
      })
    },
    60_000,
  )

  testWithPostgres(
    'outra empresa não lê: o mesmo 404 de ocorrência inexistente',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, {})
        const other = await seedCompany(database)
        const { saved } = await readRequirements(database, world)
        const useCase = createReadTripOccurrenceDetailUseCase({
          reader: { findDetail: (input) => findTripOccurrenceDetail(database.db, input) },
        })

        await expect(
          useCase.execute({ context: { companyId: other.companyId }, occurrenceId: saved.id }),
        ).rejects.toBeInstanceOf(TripOccurrenceNotFoundError)
      })
    },
    60_000,
  )
})
