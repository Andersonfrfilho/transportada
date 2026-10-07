/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (T7.2b N1), contra Postgres real: a correção respeita o modo EFETIVO do tipo. Campo
 * desligado (no tipo ou pela exceção do contratante/destinatário DA NOTA) não é gravado e não é
 * recusado; campo exigido recusa só a limpeza explícita; ausente mantém.
 */
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { contractors, deliveryClients } from '../../src/database/delivery-client.schema.js'
import { nfeParticipants, nfeProducts } from '../../src/database/nfe.schema.js'
import {
  companyOccurrenceTypeContractorOverrides,
  companyOccurrenceTypeRecipientOverrides,
  companyOccurrenceTypes,
  tripDocumentOccurrenceProducts,
  tripDocumentOccurrences,
  tripDocuments,
} from '../../src/database/trip.schema.js'
import { correctOccurrenceItems } from '../../src/trips/application/correct-occurrence-items.use-case.js'
import { ApiError } from '../../src/shared/api.error.js'
import { DrizzleOccurrenceCorrectionUnitOfWork } from '../../src/trips/infrastructure/drizzle-occurrence-correction.repository.js'
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

type Mode = 'off' | 'optional' | 'required'

async function seedWorld(database: TestDatabase, scope: 'item' | 'occurrence') {
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
    declaredAmountMode: 'optional',
    declaredAmountScope: scope,
    id: typeId,
    itemsMinimumCount: null,
    itemsMode: 'optional',
    name: 'Tipo configurado',
    referenceNumberMode: 'optional',
    stage: 'delivery',
  })
  return { company, contractorId, trip, typeId }
}

type World = Awaited<ReturnType<typeof seedWorld>>

async function setTypeModes(
  database: TestDatabase,
  world: World,
  modes: { readonly declaredAmountMode: Mode; readonly referenceNumberMode: Mode },
) {
  await database.db
    .update(companyOccurrenceTypes)
    .set(modes)
    .where(eq(companyOccurrenceTypes.id, world.typeId))
}

function registerWithValues(database: TestDatabase, world: World) {
  return registerStreetOccurrence(database, {
    attachmentObjectId: null,
    company: world.company,
    declaredAmount: '50',
    items: [{ productCode: 'P1', quantity: '1' }],
    referenceNumber: 'NFD 1',
    trip: world.trip,
    typeId: world.typeId,
  })
}

function correct(
  database: TestDatabase,
  world: World,
  occurrenceId: string,
  input: Partial<Parameters<typeof correctOccurrenceItems>[0]>,
) {
  return correctOccurrenceItems({
    actorUserId: world.company.userId,
    companyId: world.company.companyId,
    occurrenceId,
    productCode: '',
    productCodes: ['P1'],
    productQuantities: ['1'],
    productQuantityUnits: ['CX'],
    unitOfWork: new DrizzleOccurrenceCorrectionUnitOfWork(database.db),
    ...input,
  })
}

async function readStored(database: TestDatabase, occurrenceId: string) {
  const [occurrence] = await database.db
    .select({
      declaredAmount: tripDocumentOccurrences.declaredAmount,
      referenceNumber: tripDocumentOccurrences.referenceNumber,
    })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.id, occurrenceId))
  const lines = await database.db
    .select({ declaredAmount: tripDocumentOccurrenceProducts.declaredAmount })
    .from(tripDocumentOccurrenceProducts)
    .where(eq(tripDocumentOccurrenceProducts.occurrenceId, occurrenceId))
  return { lines, occurrence }
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  )
}

describe('a correção sob o modo efetivo do tipo contra Postgres (spec 247 T7.2b N1)', () => {
  testWithPostgres(
    'tipo que virou off depois do registro: número e valor novos são descartados, sem erro',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, 'occurrence')
        const saved = await registerWithValues(database, world)
        await setTypeModes(database, world, {
          declaredAmountMode: 'off',
          referenceNumberMode: 'off',
        })

        await correct(database, world, saved.id, { declaredAmount: '99', referenceNumber: 'NFD 2' })

        const stored = await readStored(database, saved.id)
        expect(stored.occurrence?.referenceNumber).toBe('NFD 1')
        expect(Number(stored.occurrence?.declaredAmount)).toBe(50)
      })
    },
    60_000,
  )

  testWithPostgres(
    'valor pago por linha com o modo off: a linha é gravada sem o valor',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, 'item')
        const saved = await registerStreetOccurrence(database, {
          attachmentObjectId: null,
          company: world.company,
          items: [{ declaredAmount: '10', productCode: 'P1', quantity: '1' }],
          trip: world.trip,
          typeId: world.typeId,
        })
        await setTypeModes(database, world, {
          declaredAmountMode: 'off',
          referenceNumberMode: 'off',
        })

        await correct(database, world, saved.id, { productDeclaredAmounts: ['77'] })

        expect(Number((await readStored(database, saved.id)).lines[0]?.declaredAmount)).toBe(10)
      })
    },
    60_000,
  )

  testWithPostgres(
    'exceção do contratante da nota desliga o que o tipo exigia: descarta; a do destinatário também',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, 'occurrence')
        const saved = await registerWithValues(database, world)
        await setTypeModes(database, world, {
          declaredAmountMode: 'required',
          referenceNumberMode: 'required',
        })
        await database.db.insert(companyOccurrenceTypeContractorOverrides).values({
          companyId: world.company.companyId,
          contractorId: world.contractorId,
          occurrenceTypeId: world.typeId,
          referenceNumberMode: 'off',
        })
        await database.db.insert(companyOccurrenceTypeRecipientOverrides).values({
          companyId: world.company.companyId,
          declaredAmountMode: 'off',
          occurrenceTypeId: world.typeId,
          taxId: RECIPIENT_TAX_ID,
        })

        await correct(database, world, saved.id, { declaredAmount: '99', referenceNumber: 'NFD 2' })

        const stored = await readStored(database, saved.id)
        expect(stored.occurrence?.referenceNumber).toBe('NFD 1')
        expect(Number(stored.occurrence?.declaredAmount)).toBe(50)
      })
    },
    60_000,
  )

  testWithPostgres(
    'tipo exigido: limpar com nulo é 422 e não grava; ausente mantém; outro valor passa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, 'occurrence')
        const saved = await registerWithValues(database, world)
        await setTypeModes(database, world, {
          declaredAmountMode: 'required',
          referenceNumberMode: 'required',
        })

        const clearNumber = await rejection(
          correct(database, world, saved.id, { referenceNumber: null }),
        )
        const clearAmount = await rejection(
          correct(database, world, saved.id, { declaredAmount: null }),
        )
        await correct(database, world, saved.id, {})
        const untouched = await readStored(database, saved.id)
        await correct(database, world, saved.id, { declaredAmount: '60', referenceNumber: 'NFD 3' })
        const changed = await readStored(database, saved.id)

        expect((clearNumber as ApiError).status).toBe(422)
        expect((clearNumber as ApiError).code).toBe('TRIP_OCCURRENCE_REFERENCE_NUMBER_REQUIRED')
        expect((clearAmount as ApiError).code).toBe('TRIP_OCCURRENCE_DECLARED_AMOUNT_REQUIRED')
        expect((clearAmount as ApiError).details?.[0]?.field).toBe('declaredAmount')
        expect(untouched.occurrence?.referenceNumber).toBe('NFD 1')
        expect(Number(untouched.occurrence?.declaredAmount)).toBe(50)
        expect(changed.occurrence?.referenceNumber).toBe('NFD 3')
        expect(Number(changed.occurrence?.declaredAmount)).toBe(60)
      })
    },
    60_000,
  )
})
