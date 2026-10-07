/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T4.4 (CA06, RF10, RF14), contra Postgres real: o registro do motorista com itens, número do
 * documento do cliente e valor pago, pelo caminho real (`registerDriverOccurrence` + repositórios
 * Drizzle, a mesma porta que `main.ts` monta). A exigência é a **efetiva** da nota — tipo + exceção do
 * contratante e do destinatário lidos da nota no servidor —, o `unit_value` sai de `nfe_products`, e
 * nada de preço, unidade ou contratante é lido do corpo.
 */
import { describe, expect, test } from 'bun:test'
import { and, asc, eq } from 'drizzle-orm'

import { contractors } from '../../src/database/delivery-client.schema.js'
import { nfeParticipants, nfeProducts } from '../../src/database/nfe.schema.js'
import {
  companyOccurrenceTypeContractorOverrides,
  companyOccurrenceTypes,
  tripDocumentOccurrenceProducts,
  tripDocumentOccurrences,
  tripDocuments,
} from '../../src/database/trip.schema.js'
import { ApiError } from '../../src/shared/api.error.js'
import { parseRegisterOccurrenceRequest } from '../../src/trips/presentation/occurrence.schema.js'
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
const OTHER_CONTRACTOR_TAX_ID = '11444777000161'
const RECIPIENT_TAX_ID = '12345678000190'
const REFERENCE_NUMBER = 'NFD 45029'
const FORGED_UNIT_VALUE = '0.0100'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type Mode = 'off' | 'optional' | 'required'

type World = {
  readonly company: Company
  readonly contractorId: string
  readonly otherContractorId: string
  readonly trip: SeededTrip
}

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const reason = await promise.then(
    () => undefined,
    (error: unknown) => error,
  )
  if (!(reason instanceof ApiError)) throw new Error(`Expected an ApiError, got ${String(reason)}`)
  return reason
}

async function seedDocumentProducts(database: TestDatabase, world: World): Promise<void> {
  const [row] = await database.db
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocuments)
    .where(eq(tripDocuments.id, world.trip.documentId))
  if (row?.nfeDocumentId === null || row === undefined) throw new Error('Seeded document vanished')
  const documentId = row.nfeDocumentId
  const base = { cfop: '5102', companyId: world.company.companyId, documentId, ncm: '19053100' }
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
      quantity: '1.0000',
      totalValue: '57.2000',
      unitValue: '57.2000',
    },
    {
      ...base,
      code: 'P3',
      commercialUnit: 'FD',
      description: 'Fardo de água',
      ordinal: 3n,
      quantity: '1.0000',
      totalValue: '10.0000',
      unitValue: '10.0000',
    },
    {
      ...base,
      code: 'P3',
      commercialUnit: 'FD',
      description: 'Fardo de água',
      ordinal: 4n,
      quantity: '1.0000',
      totalValue: '12.0000',
      unitValue: '12.0000',
    },
  ])
  await database.db.insert(nfeParticipants).values([
    { companyId: world.company.companyId, documentId, role: 'emitter', taxId: EMITTER_TAX_ID },
    {
      companyId: world.company.companyId,
      documentId,
      legalName: 'Destinatário',
      role: 'recipient',
      taxId: RECIPIENT_TAX_ID,
    },
  ])
}

async function seedWorld(database: TestDatabase): Promise<World> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  const contractorId = crypto.randomUUID()
  const otherContractorId = crypto.randomUUID()
  await database.db.insert(contractors).values([
    { companyId: company.companyId, id: contractorId, taxId: EMITTER_TAX_ID },
    { companyId: company.companyId, id: otherContractorId, taxId: OTHER_CONTRACTOR_TAX_ID },
  ])
  const world = { company, contractorId, otherContractorId, trip }
  await seedDocumentProducts(database, world)
  return world
}

async function seedType(
  database: TestDatabase,
  input: {
    readonly allowsMultipleItems?: boolean
    readonly company: Company
    readonly declaredAmountMode: Mode
    readonly declaredAmountScope: 'item' | 'occurrence'
    readonly itemsMode: Mode
    readonly referenceNumberMode: Mode
  },
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    allowsMultipleItems: input.allowsMultipleItems ?? true,
    companyId: input.company.companyId,
    declaredAmountMode: input.declaredAmountMode,
    declaredAmountScope: input.declaredAmountScope,
    id,
    itemsMinimumCount: null,
    itemsMode: input.itemsMode,
    name: `Devolução ${id.slice(0, 6)}`,
    referenceNumberMode: input.referenceNumberMode,
    stage: 'delivery',
  })
  return id
}

async function readOccurrence(database: TestDatabase, occurrenceId: string) {
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
  return { lines, occurrence }
}

async function countWrites(database: TestDatabase, companyId: string) {
  const occurrences = await database.db
    .select({ id: tripDocumentOccurrences.id })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.companyId, companyId))
  const lines = await database.db
    .select({ id: tripDocumentOccurrenceProducts.occurrenceId })
    .from(tripDocumentOccurrenceProducts)
    .where(eq(tripDocumentOccurrenceProducts.companyId, companyId))
  return { lines: lines.length, occurrences: occurrences.length }
}

function jsonRegisterRequest(body: unknown): Request {
  return new Request('http://localhost/me/current-trip/documents/x/occurrences', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
}

describe('registro do motorista com itens, número e valor pago (spec 247 T4.4, CA06)', () => {
  testWithPostgres(
    'exigido e ausente recusa; exceção de outro contratante não vale; a do contratante da nota afrouxa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const scope = { company: world.company, trip: world.trip }
        const typeId = await seedType(database, {
          company: world.company,
          declaredAmountMode: 'required',
          declaredAmountScope: 'item',
          itemsMode: 'optional',
          referenceNumberMode: 'required',
        })
        const items = [{ productCode: 'P1', quantity: '1' }]
        const register = (input: { readonly referenceNumber?: string }) =>
          registerStreetOccurrence(database, {
            ...scope,
            attachmentObjectId: null,
            items,
            typeId,
            ...input,
          })

        const withoutNumber = await rejection(register({}))
        expect(withoutNumber.code).toBe('TRIP_OCCURRENCE_REFERENCE_NUMBER_REQUIRED')
        expect(withoutNumber.status).toBe(422)
        expect(withoutNumber.details?.[0]?.field).toBe('referenceNumber')

        await database.db.insert(companyOccurrenceTypeContractorOverrides).values({
          attachmentMode: 'off',
          companyId: world.company.companyId,
          contractorId: world.otherContractorId,
          declaredAmountMode: 'optional',
          occurrenceTypeId: typeId,
          referenceNumberMode: 'optional',
        })
        expect((await rejection(register({}))).code).toBe(
          'TRIP_OCCURRENCE_REFERENCE_NUMBER_REQUIRED',
        )

        const withoutAmount = await rejection(register({ referenceNumber: REFERENCE_NUMBER }))
        expect(withoutAmount.code).toBe('TRIP_OCCURRENCE_DECLARED_AMOUNT_REQUIRED')
        expect(withoutAmount.details?.[0]?.field).toBe('items[0].declaredAmount')

        await database.db.insert(companyOccurrenceTypeContractorOverrides).values({
          attachmentMode: 'off',
          companyId: world.company.companyId,
          contractorId: world.contractorId,
          declaredAmountMode: 'optional',
          occurrenceTypeId: typeId,
          referenceNumberMode: 'optional',
        })
        const accepted = await register({})
        expect(accepted.id).toBeString()
        expect(accepted.referenceNumber).toBeNull()
        expect(accepted.declaredAmount).toBeNull()
      })
    },
    60_000,
  )

  testWithPostgres(
    'preço forjado no valor pago é gravado como valor pago; unit_value e unidade saem da nota',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const typeId = await seedType(database, {
          company: world.company,
          declaredAmountMode: 'optional',
          declaredAmountScope: 'item',
          itemsMode: 'optional',
          referenceNumberMode: 'off',
        })

        const saved = await registerStreetOccurrence(database, {
          attachmentObjectId: null,
          company: world.company,
          items: [{ declaredAmount: '99999.99', productCode: 'P1', quantity: '2' }],
          referenceNumber: REFERENCE_NUMBER,
          trip: world.trip,
          typeId,
        })
        const stored = await readOccurrence(database, saved.id)

        expect(stored.occurrence?.referenceNumber).toBe(REFERENCE_NUMBER)
        expect(stored.lines).toEqual([
          {
            declaredAmount: '99999.9900',
            position: 1,
            productCode: 'P1',
            quantity: '2.000',
            quantityUnit: 'CX',
            unitValue: '19.9950',
          },
        ])
        expect(saved.items).toEqual([
          {
            declaredAmount: '99999.9900',
            productCode: 'P1',
            quantity: '2.000',
            quantityUnit: 'CX',
            unitValue: '19.9950',
          },
        ])

        const forgedInItem = await rejection(
          parseRegisterOccurrenceRequest(
            jsonRegisterRequest({
              items: [{ productCode: 'P1', quantity: '1', unitValue: FORGED_UNIT_VALUE }],
              occurrenceTypeId: typeId,
            }),
          ),
        )
        expect(forgedInItem.status).toBe(400)
        const forgedAtTop = await rejection(
          parseRegisterOccurrenceRequest(
            jsonRegisterRequest({ occurrenceTypeId: typeId, unitValue: FORGED_UNIT_VALUE }),
          ),
        )
        expect(forgedAtTop.status).toBe(400)
      })
    },
    60_000,
  )

  testWithPostgres('token da empresa B com nota e tipo da A: 409 e nenhuma escrita', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      const otherCompany = await seedCompany(database)
      const typeId = await seedType(database, {
        company: world.company,
        declaredAmountMode: 'optional',
        declaredAmountScope: 'item',
        itemsMode: 'optional',
        referenceNumberMode: 'optional',
      })

      const refused = await rejection(
        registerStreetOccurrence(database, {
          attachmentObjectId: null,
          company: otherCompany,
          documentId: world.trip.documentId,
          items: [{ declaredAmount: '10.00', productCode: 'P1', quantity: '1' }],
          referenceNumber: REFERENCE_NUMBER,
          trip: world.trip,
          typeId,
        }),
      )

      expect(refused.status).toBe(409)
      expect(refused.code).toBe('TRIP_DOCUMENT_NOT_REACHABLE')
      expect(await countWrites(database, world.company.companyId)).toEqual({
        lines: 0,
        occurrences: 0,
      })
      expect(await countWrites(database, otherCompany.companyId)).toEqual({
        lines: 0,
        occurrences: 0,
      })
    })
  })

  testWithPostgres(
    'items_mode off da exceção leva o valor pago à ocorrência; itens enviados são recusados',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const typeId = await seedType(database, {
          company: world.company,
          declaredAmountMode: 'required',
          declaredAmountScope: 'item',
          itemsMode: 'optional',
          referenceNumberMode: 'off',
        })
        await database.db.insert(companyOccurrenceTypeContractorOverrides).values({
          attachmentMode: 'off',
          companyId: world.company.companyId,
          contractorId: world.contractorId,
          itemsMode: 'off',
          occurrenceTypeId: typeId,
        })
        const base = {
          attachmentObjectId: null,
          company: world.company,
          trip: world.trip,
          typeId,
        }

        const withItems = await rejection(
          registerStreetOccurrence(database, {
            ...base,
            items: [{ declaredAmount: '5.00', productCode: 'P1', quantity: '1' }],
          }),
        )
        expect(withItems.code).toBe('OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED')

        const withoutAmount = await rejection(registerStreetOccurrence(database, base))
        expect(withoutAmount.code).toBe('TRIP_OCCURRENCE_DECLARED_AMOUNT_REQUIRED')
        expect(withoutAmount.details?.[0]?.field).toBe('declaredAmount')

        const saved = await registerStreetOccurrence(database, {
          ...base,
          declaredAmount: '150.5',
        })
        const stored = await readOccurrence(database, saved.id)
        expect(stored.occurrence?.declaredAmount).toBe('150.5000')
        expect(stored.lines).toEqual([])
      })
    },
    60_000,
  )

  testWithPostgres(
    'nota inteira com produtos opcionais: o valor pago exigido é da ocorrência, e zero vale',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const typeId = await seedType(database, {
          company: world.company,
          declaredAmountMode: 'required',
          declaredAmountScope: 'item',
          itemsMode: 'optional',
          referenceNumberMode: 'off',
        })
        const base = {
          attachmentObjectId: null,
          company: world.company,
          trip: world.trip,
          typeId,
        }

        const missing = await rejection(registerStreetOccurrence(database, base))
        expect(missing.code).toBe('TRIP_OCCURRENCE_DECLARED_AMOUNT_REQUIRED')
        expect(missing.details?.[0]?.field).toBe('declaredAmount')

        const saved = await registerStreetOccurrence(database, { ...base, declaredAmount: '0' })
        expect(saved.declaredAmount).toBe('0.0000')
        expect(saved.items).toEqual([])
      })
    },
    60_000,
  )

  testWithPostgres(
    'reenvio pela mesma chave devolve o mesmo corpo sem duplicar as linhas',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const typeId = await seedType(database, {
          company: world.company,
          declaredAmountMode: 'optional',
          declaredAmountScope: 'occurrence',
          itemsMode: 'optional',
          referenceNumberMode: 'required',
        })
        const request = {
          attachmentObjectId: null,
          company: world.company,
          declaredAmount: '199.99',
          idempotencyKey: crypto.randomUUID(),
          items: [
            { productCode: 'P1', quantity: '1' },
            { productCode: 'P2', quantity: '1' },
          ],
          referenceNumber: REFERENCE_NUMBER,
          trip: world.trip,
          typeId,
        }

        const first = await registerStreetOccurrence(database, request)
        const replay = await registerStreetOccurrence(database, request)

        expect(replay).toEqual(first)
        expect(first.referenceNumber).toBe(REFERENCE_NUMBER)
        expect(first.declaredAmount).toBe('199.9900')
        expect(first.items.map((item) => item.productCode)).toEqual(['P1', 'P2'])
        expect(await countWrites(database, world.company.companyId)).toEqual({
          lines: 2,
          occurrences: 1,
        })
      })
    },
    60_000,
  )

  testWithPostgres(
    'quantidade acima da soma da nota é 400; código repetido na nota soma e usa o menor ordinal',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const typeId = await seedType(database, {
          company: world.company,
          declaredAmountMode: 'optional',
          declaredAmountScope: 'item',
          itemsMode: 'optional',
          referenceNumberMode: 'off',
        })
        const base = {
          attachmentObjectId: null,
          company: world.company,
          trip: world.trip,
          typeId,
        }

        const above = await rejection(
          registerStreetOccurrence(database, {
            ...base,
            items: [{ productCode: 'P2', quantity: '1.001' }],
          }),
        )
        expect(above.status).toBe(400)
        expect(above.code).toBe('OCCURRENCE_ITEM_QUANTITY_ABOVE_DOCUMENT')

        const varying = await rejection(
          registerStreetOccurrence(database, {
            ...base,
            items: [{ productCode: 'P3', quantity: '2' }],
          }),
        )
        expect(varying.code).toBe('TRIP_OCCURRENCE_DECLARED_AMOUNT_REQUIRED')
        expect(varying.details?.[0]?.field).toBe('items[0].declaredAmount')

        const saved = await registerStreetOccurrence(database, {
          ...base,
          items: [{ declaredAmount: '22.00', productCode: 'P3', quantity: '2' }],
        })
        const stored = await readOccurrence(database, saved.id)
        expect(stored.lines[0]?.unitValue).toBe('10.0000')
        expect(stored.lines[0]?.quantity).toBe('2.000')
      })
    },
    60_000,
  )

  testWithPostgres(
    'código fora da nota e dois itens em tipo de item único são recusados',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const typeId = await seedType(database, {
          allowsMultipleItems: false,
          company: world.company,
          declaredAmountMode: 'off',
          declaredAmountScope: 'item',
          itemsMode: 'optional',
          referenceNumberMode: 'off',
        })
        const base = {
          attachmentObjectId: null,
          company: world.company,
          trip: world.trip,
          typeId,
        }

        const outside = await rejection(
          registerStreetOccurrence(database, {
            ...base,
            items: [{ productCode: 'NAO-EXISTE', quantity: '1' }],
          }),
        )
        expect(outside.code).toBe('OCCURRENCE_PRODUCT_NOT_IN_DOCUMENT')

        const twoItems = await rejection(
          registerStreetOccurrence(database, {
            ...base,
            items: [
              { productCode: 'P1', quantity: '1' },
              { productCode: 'P2', quantity: '1' },
            ],
          }),
        )
        expect(twoItems.code).toBe('OCCURRENCE_TYPE_SINGLE_ITEM')
        expect(
          await database.db
            .select({ id: tripDocumentOccurrences.id })
            .from(tripDocumentOccurrences)
            .where(
              and(
                eq(tripDocumentOccurrences.companyId, world.company.companyId),
                eq(tripDocumentOccurrences.occurrenceTypeId, typeId),
              ),
            ),
        ).toEqual([])
      })
    },
    60_000,
  )
})
