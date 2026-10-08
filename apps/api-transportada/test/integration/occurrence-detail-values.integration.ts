/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (T7.2 R2, achados A2 e M3), contra Postgres real: o detalhe da ocorrência publica o que o
 * registro gravou — número do documento do cliente, valor pago da ocorrência e, por linha, o valor
 * unitário copiado e o valor pago — em campos NOVOS no nível da ocorrência (`referenceNumber`,
 * `declaredAmount`, `itemValues`), sem mexer na forma dos objetos de `items` que o painel publicado lê.
 * O valor pago zero volta `"0.00"`, nunca `null`; outra empresa não lê (404 como hoje).
 */
import { describe, expect, test } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { contractors } from '../../src/database/delivery-client.schema.js'
import { nfeParticipants, nfeProducts } from '../../src/database/nfe.schema.js'
import { companyOccurrenceTypes, tripDocuments } from '../../src/database/trip.schema.js'
import { correctOccurrenceItems } from '../../src/trips/application/correct-occurrence-items.use-case.js'
import { createReadTripOccurrenceDetailUseCase } from '../../src/trips/application/read-trip-occurrence-detail.use-case.js'
import { TripOccurrenceNotFoundError } from '../../src/trips/domain/trip.error.js'
import { DrizzleOccurrenceCorrectionUnitOfWork } from '../../src/trips/infrastructure/drizzle-occurrence-correction.repository.js'
import { findTripOccurrenceDetail } from '../../src/trips/infrastructure/trip-occurrence-detail.query.js'
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
const GOLDEN_URL = new URL('../fixtures/occurrence-detail-values.golden.json', import.meta.url)
const NEW_DETAIL_KEYS = ['declaredAmount', 'itemValues', 'referenceNumber', 'requirements'] as const

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

async function readDetail(database: TestDatabase, companyId: string, occurrenceId: string) {
  const detail = await findTripOccurrenceDetail(database.db, { companyId, occurrenceId })
  if (detail === null) throw new Error('Detail not found')
  return detail
}

function pickNewKeys(detail: object): Record<string, unknown> {
  const serialized = JSON.parse(JSON.stringify(detail)) as Record<string, unknown>
  return Object.fromEntries(NEW_DETAIL_KEYS.map((key) => [key, serialized[key]]))
}

describe('o detalhe da ocorrência publica o que o registro gravou (spec 247 T7.2 R2)', () => {
  testWithPostgres(
    'dois itens, número e valores pagos: o detalhe devolve os campos novos, iguais ao JSON de referência, e os itens antigos não ganham chave',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const saved = await registerStreetOccurrence(database, {
          attachmentObjectId: null,
          company: world.company,
          items: [
            { declaredAmount: '50', productCode: 'P1', quantity: '2' },
            { declaredAmount: '0', productCode: 'P2', quantity: '1' },
          ],
          referenceNumber: 'NFD 45029',
          trip: world.trip,
          typeId: world.typeId,
        })

        const detail = await readDetail(database, world.company.companyId, saved.id)

        const golden = (await Bun.file(GOLDEN_URL).json()) as unknown
        expect(pickNewKeys(detail)).toEqual(golden as Record<string, unknown>)
        expect(detail.items.map((item) => Object.keys(item).sort())).toEqual([
          ['code', 'description', 'quantity', 'unit'],
          ['code', 'description', 'quantity', 'unit'],
        ])
      })
    },
    60_000,
  )

  testWithPostgres(
    'valor pago da ocorrência: devolve duas casas, e zero é "0.00", nunca null',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, { declaredAmountScope: 'occurrence' })
        const paid = await registerStreetOccurrence(database, {
          attachmentObjectId: null,
          company: world.company,
          declaredAmount: '150.5',
          items: [{ productCode: 'P1', quantity: '1' }],
          trip: world.trip,
          typeId: world.typeId,
        })
        const zero = await registerStreetOccurrence(database, {
          attachmentObjectId: null,
          company: world.company,
          declaredAmount: '0',
          trip: world.trip,
          typeId: world.typeId,
        })
        const none = await registerStreetOccurrence(database, {
          attachmentObjectId: null,
          company: world.company,
          trip: world.trip,
          typeId: world.typeId,
        })

        const paidDetail = await readDetail(database, world.company.companyId, paid.id)
        expect(paidDetail.declaredAmount).toBe('150.50')
        expect(paidDetail.referenceNumber).toBeNull()
        expect(paidDetail.itemValues).toEqual([
          { declaredAmount: null, productCode: 'P1', quantity: '1.000', unitValue: '19.9950' },
        ])
        expect((await readDetail(database, world.company.companyId, zero.id)).declaredAmount).toBe(
          '0.00',
        )
        const noneDetail = await readDetail(database, world.company.companyId, none.id)
        expect(noneDetail.declaredAmount).toBeNull()
        expect(noneDetail.itemValues).toEqual([])
      })
    },
    60_000,
  )

  testWithPostgres(
    'a correção troca os valores e o detalhe reflete; o valor unitário copiado sobrevive à mudança da nota',
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

        await correctOccurrenceItems({
          actorUserId: world.company.userId,
          companyId: world.company.companyId,
          occurrenceId: saved.id,
          productCode: '',
          productCodes: ['P1', 'P2'],
          productDeclaredAmounts: [undefined, '30'],
          productQuantities: ['1', '1'],
          productQuantityUnits: ['CX', 'UN'],
          referenceNumber: 'NFD 2',
          unitOfWork: new DrizzleOccurrenceCorrectionUnitOfWork(database.db),
        })

        const detail = await readDetail(database, world.company.companyId, saved.id)
        expect(detail.referenceNumber).toBe('NFD 2')
        expect(detail.itemValues).toEqual([
          { declaredAmount: '50.00', productCode: 'P1', quantity: '1.000', unitValue: '19.9950' },
          { declaredAmount: '30.00', productCode: 'P2', quantity: '1.000', unitValue: '57.2000' },
        ])
      })
    },
    60_000,
  )

  testWithPostgres(
    'outra empresa não lê: o caso de uso responde o mesmo 404 de ocorrência inexistente',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const other = await seedCompany(database)
        const saved = await registerStreetOccurrence(database, {
          attachmentObjectId: null,
          company: world.company,
          items: [{ declaredAmount: '50', productCode: 'P1', quantity: '2' }],
          referenceNumber: 'NFD 1',
          trip: world.trip,
          typeId: world.typeId,
        })
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
