/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T4.8 (RF13, RF14, P5), contra Postgres real: o escritório corrige uma ocorrência registrada
 * pelo motorista com itens, número e valor pago. O `unit_value` copiado no registro sobrevive à
 * correção (a nota pode ter mudado depois); o de um código novo sai da nota; a correção guarda os
 * valores antigos em `previous_items` e a API continua publicando só `code`/`quantity`/`unit` ao painel; e
 * a correção não manda e-mail sozinha.
 */
import { describe, expect, test } from 'bun:test'
import { and, asc, eq } from 'drizzle-orm'

import { contractors } from '../../src/database/delivery-client.schema.js'
import { contractorMailMessages } from '../../src/database/contractor-mail.schema.js'
import { nfeParticipants, nfeProducts } from '../../src/database/nfe.schema.js'
import {
  companyOccurrenceTypes,
  tripDocumentOccurrenceCorrections,
  tripDocumentOccurrenceProducts,
  tripDocumentOccurrences,
  tripDocuments,
} from '../../src/database/trip.schema.js'
import { ApiError } from '../../src/shared/api.error.js'
import { correctOccurrenceItems } from '../../src/trips/application/correct-occurrence-items.use-case.js'
import { TripOccurrenceNotFoundError } from '../../src/trips/domain/trip.error.js'
import { DrizzleOccurrenceCorrectionUnitOfWork } from '../../src/trips/infrastructure/drizzle-occurrence-correction.repository.js'
import { registerStreetOccurrence } from '../fixtures/street-occurrence-registration.fixture.js'
import {
  seedCompany,
  seedTrip,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import type {
  Company,
  SeededTrip,
  TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const EMITTER_TAX_ID = '30290856000160'
const RECIPIENT_TAX_ID = '12345678000190'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type World = {
  readonly company: Company
  readonly nfeDocumentId: string
  readonly trip: SeededTrip
  readonly typeId: string
}

async function seedWorld(
  database: TestDatabase,
  type: { readonly declaredAmountScope: 'item' | 'occurrence' } = { declaredAmountScope: 'item' },
): Promise<World> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  const [row] = await database.db
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocuments)
    .where(eq(tripDocuments.id, trip.documentId))
  if (row?.nfeDocumentId === null || row === undefined) throw new Error('Seeded document vanished')
  const documentId = row.nfeDocumentId
  await database.db
    .insert(contractors)
    .values({ companyId: company.companyId, id: crypto.randomUUID(), taxId: EMITTER_TAX_ID })
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
  const base = { cfop: '5102', companyId: company.companyId, documentId, ncm: '19053100' }
  await database.db.insert(nfeProducts).values([
    {
      ...base,
      code: 'P1',
      commercialUnit: 'CX',
      description: 'Biscoito',
      ordinal: 1n,
      quantity: '3.0000',
      totalValue: '59.9850',
      unitValue: '19.9950',
    },
    {
      ...base,
      code: 'P2',
      commercialUnit: 'UN',
      description: 'Bolo',
      ordinal: 2n,
      quantity: '4.0000',
      totalValue: '228.8000',
      unitValue: '57.2000',
    },
  ])
  const typeId = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    allowsMultipleItems: true,
    companyId: company.companyId,
    declaredAmountMode: 'optional',
    declaredAmountScope: type.declaredAmountScope,
    id: typeId,
    itemsMinimumCount: null,
    itemsMode: 'optional',
    name: 'Tipo configurado',
    referenceNumberMode: 'optional',
    stage: 'delivery',
  })
  return { company, nfeDocumentId: documentId, trip, typeId }
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
    productCodes: [],
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
    .select({
      declaredAmount: tripDocumentOccurrenceProducts.declaredAmount,
      position: tripDocumentOccurrenceProducts.position,
      productCode: tripDocumentOccurrenceProducts.productCode,
      quantity: tripDocumentOccurrenceProducts.quantity,
      quantityUnit: tripDocumentOccurrenceProducts.quantityUnit,
      unitValue: tripDocumentOccurrenceProducts.unitValue,
    })
    .from(tripDocumentOccurrenceProducts)
    .where(eq(tripDocumentOccurrenceProducts.occurrenceId, occurrenceId))
    .orderBy(asc(tripDocumentOccurrenceProducts.position))
  const corrections = await database.db
    .select({ previousItems: tripDocumentOccurrenceCorrections.previousItems })
    .from(tripDocumentOccurrenceCorrections)
    .where(eq(tripDocumentOccurrenceCorrections.occurrenceId, occurrenceId))
    .orderBy(asc(tripDocumentOccurrenceCorrections.createdAt))
  return { corrections, lines, occurrence }
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  )
}

describe('a correção com número e valores pagos contra Postgres (spec 247 T4.8)', () => {
  testWithPostgres(
    'troca número e valores, mantém o unit_value copiado, busca o da nota para o código novo e guarda o antigo em previous_items',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const saved = await registerStreetOccurrence(database, {
          attachmentObjectId: null,
          company: world.company,
          items: [{ declaredAmount: '50', productCode: 'P1', quantity: '2' }],
          referenceNumber: 'NFD 1',
          trip: world.trip,
          typeId: world.typeId,
        })
        await database.db
          .update(nfeProducts)
          .set({ unitValue: '99.0000' })
          .where(and(eq(nfeProducts.documentId, world.nfeDocumentId), eq(nfeProducts.code, 'P1')))

        const view = await correct(database, world, saved.id, {
          productCodes: ['P1', 'P2'],
          productDeclaredAmounts: [undefined, '30'],
          productQuantities: ['1', '1'],
          productQuantityUnits: ['CX', 'UN'],
          referenceNumber: 'NFD 2',
        })
        const stored = await readStored(database, saved.id)

        expect(stored.lines).toEqual([
          {
            declaredAmount: '50.0000',
            position: 1,
            productCode: 'P1',
            quantity: '1.000',
            quantityUnit: 'CX',
            unitValue: '19.9950',
          },
          {
            declaredAmount: '30.0000',
            position: 2,
            productCode: 'P2',
            quantity: '1.000',
            quantityUnit: 'UN',
            unitValue: '57.2000',
          },
        ])
        expect(stored.occurrence?.referenceNumber).toBe('NFD 2')
        expect(stored.corrections).toEqual([
          {
            previousItems: [
              {
                code: 'P1',
                declaredAmount: '50.0000',
                quantity: '2.000',
                unit: 'CX',
                unitValue: '19.9950',
              },
            ],
          },
        ])
        /** O painel publicado só conhece três chaves por item: a API não as aumenta antes de ele tolerar. */
        expect(view.corrections[0]?.previousItems).toEqual([
          { code: 'P1', quantity: '2.000', unit: 'CX' },
        ])
        expect(view.products).toEqual([
          { code: 'P1', quantity: '1.000', unit: 'CX' },
          { code: 'P2', quantity: '1.000', unit: 'UN' },
        ])
        const mails = await database.db
          .select({ id: contractorMailMessages.id })
          .from(contractorMailMessages)
          .where(eq(contractorMailMessages.companyId, world.company.companyId))
        expect(mails).toEqual([])
      })
    },
    60_000,
  )

  testWithPostgres(
    'os mesmos valores em outra escala não são mudança: nada grava, nenhum histórico',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const saved = await registerStreetOccurrence(database, {
          attachmentObjectId: null,
          company: world.company,
          items: [{ declaredAmount: '50', productCode: 'P1', quantity: '2' }],
          referenceNumber: 'NFD 1',
          trip: world.trip,
          typeId: world.typeId,
        })

        await correct(database, world, saved.id, {
          productCodes: ['P1'],
          productDeclaredAmounts: ['50.0000'],
          productQuantities: ['2.000'],
          productQuantityUnits: ['CX'],
          referenceNumber: 'NFD 1',
        })

        expect((await readStored(database, saved.id)).corrections).toEqual([])
      })
    },
    60_000,
  )

  testWithPostgres(
    'nulo limpa o número e o valor pago da ocorrência; ausente mantém',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, { declaredAmountScope: 'occurrence' })
        const saved = await registerStreetOccurrence(database, {
          attachmentObjectId: null,
          company: world.company,
          declaredAmount: '99.9',
          referenceNumber: 'NFD 1',
          trip: world.trip,
          typeId: world.typeId,
        })

        await correct(database, world, saved.id, { referenceNumber: 'NFD 7' })
        const afterNumber = await readStored(database, saved.id)
        expect(afterNumber.occurrence).toEqual({
          declaredAmount: '99.9000',
          referenceNumber: 'NFD 7',
        })

        await correct(database, world, saved.id, { declaredAmount: null, referenceNumber: null })
        const cleared = await readStored(database, saved.id)
        expect(cleared.occurrence).toEqual({ declaredAmount: null, referenceNumber: null })
        expect(cleared.corrections).toHaveLength(2)
      })
    },
    60_000,
  )

  testWithPostgres(
    'valor pago da ocorrência junto do valor de uma linha é 400; quantidade acima da nota é 400; outra empresa é 404',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const other = await seedWorld(database)
        const saved = await registerStreetOccurrence(database, {
          attachmentObjectId: null,
          company: world.company,
          items: [{ declaredAmount: '50', productCode: 'P1', quantity: '2' }],
          trip: world.trip,
          typeId: world.typeId,
        })

        const bothLevels = await rejection(
          correct(database, world, saved.id, {
            declaredAmount: '10',
            productCodes: ['P1'],
            productQuantities: ['2'],
            productQuantityUnits: ['CX'],
          }),
        )
        const aboveNota = await rejection(
          correct(database, world, saved.id, {
            productCodes: ['P1'],
            productQuantities: ['3.001'],
            productQuantityUnits: ['CX'],
          }),
        )
        const otherCompany = await rejection(
          correct(database, other, saved.id, { productCodes: [], referenceNumber: 'NFD 9' }),
        )

        expect(bothLevels).toBeInstanceOf(ApiError)
        expect((bothLevels as ApiError).status).toBe(400)
        expect((aboveNota as ApiError).code).toBe('OCCURRENCE_ITEM_QUANTITY_ABOVE_DOCUMENT')
        expect(otherCompany).toBeInstanceOf(TripOccurrenceNotFoundError)
        const stored = await readStored(database, saved.id)
        expect(stored.corrections).toEqual([])
        expect(stored.lines[0]?.quantity).toBe('2.000')
      })
    },
    60_000,
  )
})
