/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T4.6 (RF11), contra Postgres real: o snapshot do motorista (`listActiveTrips`) traz os
 * produtos de cada nota — uma consulta a `nfe_products` para a viagem inteira, nunca uma por nota — e o
 * tipo efetivo com os campos novos. O documento serializado é comparado com o JSON de referência que
 * o painel e o app do motorista usam nos contratos dos parsers deles.
 */
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { contractors } from '../../src/database/delivery-client.schema.js'
import { nfeDocuments, nfeParticipants, nfeProducts } from '../../src/database/nfe.schema.js'
import {
  companyOccurrenceTypeContractorOverrides,
  companyOccurrenceTypes,
  tripDocuments,
} from '../../src/database/trip.schema.js'
import type { ApiLogger } from '../../src/shared/api.types.js'
import {
  DRIVER_SNAPSHOT_PRODUCTS_READ_FAILED_MESSAGE,
  DrizzleCurrentDriverTripRepository,
} from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'
import {
  seedCompany,
  seedExtraDocument,
  seedTrip,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import type {
  Company,
  SeededTrip,
  TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const EMITTER_TAX_ID = '30290856000160'
const OTHER_TAX_ID = '11444777000161'
const RECIPIENT_TAX_ID = '12345678000190'
const FIXED_NUMBER = '680481'
const TYPE_ID = '00000000-0000-4000-8000-0000000000a1'
const FIXED_ACCESS_KEY = '35261030290856000160550010006804811000000017'
const GOLDEN_URL = new URL('../fixtures/driver-snapshot-document.golden.json', import.meta.url)

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type World = {
  readonly company: Company
  readonly contractorId: string
  readonly emptyDocumentId: string
  readonly nfeDocumentId: string
  readonly otherContractorId: string
  readonly trip: SeededTrip
  readonly typeId: string
}

async function nfeDocumentIdOf(database: TestDatabase, documentId: string): Promise<string> {
  const [row] = await database.db
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocuments)
    .where(eq(tripDocuments.id, documentId))
  if (row?.nfeDocumentId === null || row === undefined) throw new Error('Seeded document vanished')
  return row.nfeDocumentId
}

async function seedProducts(database: TestDatabase, company: Company, documentId: string) {
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
}

async function seedWorld(database: TestDatabase): Promise<World> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  const nfeDocumentId = await nfeDocumentIdOf(database, trip.documentId)
  await database.db
    .update(nfeDocuments)
    .set({
      accessKey: FIXED_ACCESS_KEY,
      number: FIXED_NUMBER,
      series: '1',
      totalValue: '7840.6400',
    })
    .where(eq(nfeDocuments.id, nfeDocumentId))
  const contractorId = crypto.randomUUID()
  const otherContractorId = crypto.randomUUID()
  await database.db.insert(contractors).values([
    { companyId: company.companyId, id: contractorId, taxId: EMITTER_TAX_ID },
    { companyId: company.companyId, id: otherContractorId, taxId: OTHER_TAX_ID },
  ])
  await database.db.insert(nfeParticipants).values([
    {
      companyId: company.companyId,
      documentId: nfeDocumentId,
      role: 'emitter',
      taxId: EMITTER_TAX_ID,
    },
    {
      companyId: company.companyId,
      documentId: nfeDocumentId,
      legalName: 'Destinatário',
      role: 'recipient',
      taxId: RECIPIENT_TAX_ID,
    },
  ])
  await seedProducts(database, company, nfeDocumentId)
  const emptyDocumentId = await seedExtraDocument(database, company, trip, {
    separationStatus: 'loaded',
    stopId: trip.stopId,
  })

  const typeId = TYPE_ID
  await database.db.insert(companyOccurrenceTypes).values({
    allowsMultipleItems: true,
    companyId: company.companyId,
    declaredAmountLabel: 'Valor pago pela loja',
    declaredAmountMode: 'optional',
    declaredAmountScope: 'item',
    iconName: 'money',
    id: typeId,
    itemsMinimumCount: null,
    itemsMode: 'required',
    name: 'Tipo configurado',
    referenceNumberLabel: 'Número da NFD',
    referenceNumberMode: 'required',
    stage: 'delivery',
  })
  return { company, contractorId, emptyDocumentId, nfeDocumentId, otherContractorId, trip, typeId }
}

async function readSnapshot(database: TestDatabase, world: World) {
  const repository = new DrizzleCurrentDriverTripRepository(database.db)
  const [snapshot] = await repository.listActiveTrips({
    companyId: world.company.companyId,
    driverId: world.company.firstDriverId,
  })
  const documents = snapshot?.stops.flatMap((stop) => stop.documents) ?? []
  return JSON.parse(JSON.stringify(documents)) as readonly Record<string, unknown>[]
}

function countingDatabase(database: TestDatabase['db']): {
  readonly counted: TestDatabase['db']
  readonly productSelectCount: () => number
} {
  let productSelects = 0
  const counted = new Proxy(database, {
    get(target, property, receiver) {
      if (property !== 'select') return Reflect.get(target, property, receiver)
      const select = Reflect.get(target, property, receiver) as (...args: unknown[]) => object
      return (...args: unknown[]) =>
        new Proxy(select.apply(receiver, args), {
          get(builder, key, builderReceiver) {
            const value = Reflect.get(builder, key, builderReceiver) as unknown
            if (key !== 'from' || typeof value !== 'function') return value
            return (table: unknown, ...rest: unknown[]) => {
              if (table === nfeProducts) productSelects += 1
              return (value as (...parameters: unknown[]) => unknown).apply(builder, [
                table,
                ...rest,
              ])
            }
          },
        })
    },
  })
  return { counted, productSelectCount: () => productSelects }
}

function productsFailingDatabase(database: TestDatabase['db']): TestDatabase['db'] {
  return new Proxy(database, {
    get(target, property, receiver) {
      if (property !== 'select') return Reflect.get(target, property, receiver)
      const select = Reflect.get(target, property, receiver) as (...args: unknown[]) => object
      return (...args: unknown[]) =>
        new Proxy(select.apply(receiver, args), {
          get(builder, key, builderReceiver) {
            const value = Reflect.get(builder, key, builderReceiver) as unknown
            if (key !== 'from' || typeof value !== 'function') return value
            return (table: unknown, ...rest: unknown[]) =>
              table === nfeProducts
                ? { where: () => ({ orderBy: () => Promise.reject(new Error('boom')) }) }
                : (value as (...parameters: unknown[]) => unknown).apply(builder, [table, ...rest])
          },
        })
    },
  })
}

describe('os produtos da nota no snapshot do motorista contra Postgres (spec 247 T4.6)', () => {
  testWithPostgres(
    'a leitura dos produtos que falha deixa rastro só com ids e contagem, e o snapshot segue (T7.2 M5)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const warnings: { readonly message: string; readonly metadata: unknown }[] = []
        const logger: ApiLogger = {
          error: () => undefined,
          info: () => undefined,
          warn: (message, metadata) => {
            warnings.push({ message, metadata })
          },
        }
        const repository = new DrizzleCurrentDriverTripRepository(
          productsFailingDatabase(database.db),
          logger,
        )

        const [snapshot] = await repository.listActiveTrips({
          companyId: world.company.companyId,
          driverId: world.company.firstDriverId,
        })

        const documents = snapshot?.stops.flatMap((stop) => stop.documents) ?? []
        expect(documents.length).toBeGreaterThan(0)
        expect(documents.every((document) => !('products' in document))).toBe(true)
        expect(warnings).toEqual([
          {
            message: DRIVER_SNAPSHOT_PRODUCTS_READ_FAILED_MESSAGE,
            metadata: {
              affectedDocumentCount: 2,
              companyId: world.company.companyId,
              tripIds: [world.trip.tripId],
            },
          },
        ])
        expect(JSON.stringify(warnings)).not.toContain('boom')
      })
    },
    60_000,
  )

  testWithPostgres(
    'a nota com produtos traz um item por código; a nota sem produto traz lista vazia',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)

        const documents = await readSnapshot(database, world)
        const big = documents.find((document) => document.id === world.trip.documentId)
        const empty = documents.find((document) => document.id === world.emptyDocumentId)

        expect(big?.products).toEqual([
          {
            code: 'P1',
            description: 'Biscoito',
            hasVaryingUnitValue: false,
            quantity: '3.0000',
            unit: 'CX',
            unitValue: '19.9950',
          },
          {
            code: 'P2',
            description: 'Bolo',
            hasVaryingUnitValue: false,
            quantity: '1.0000',
            unit: 'UN',
            unitValue: '57.2000',
          },
          {
            code: 'P3',
            description: 'Fardo de água',
            hasVaryingUnitValue: true,
            quantity: '2.0000',
            unit: 'FD',
            unitValue: '10.0000',
          },
        ])
        expect(empty?.products).toEqual([])
      })
    },
    60_000,
  )

  testWithPostgres(
    'o tipo efetivo leva os campos novos; nota sem produto e exceção sem Produtos levam o valor pago à ocorrência',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        await database.db.insert(companyOccurrenceTypeContractorOverrides).values({
          attachmentMode: 'off',
          companyId: world.company.companyId,
          contractorId: world.contractorId,
          declaredAmountMode: 'required',
          itemsMinimumCount: null,
          itemsMode: 'off',
          occurrenceTypeId: world.typeId,
          referenceNumberMode: 'optional',
        })
        await database.db.insert(companyOccurrenceTypeContractorOverrides).values({
          attachmentMode: 'off',
          companyId: world.company.companyId,
          contractorId: world.otherContractorId,
          declaredAmountMode: 'off',
          occurrenceTypeId: world.typeId,
        })

        const documents = await readSnapshot(database, world)
        const big = documents.find((document) => document.id === world.trip.documentId)
        const [bigType] = (big?.occurrenceTypes ?? []) as readonly Record<string, unknown>[]

        expect(bigType).toMatchObject({
          declaredAmountLabel: 'Valor pago pela loja',
          declaredAmountMode: 'required',
          declaredAmountScope: 'occurrence',
          itemsMode: 'off',
          referenceNumberLabel: 'Número da NFD',
          referenceNumberMode: 'optional',
        })

        const empty = documents.find((document) => document.id === world.emptyDocumentId)
        const [emptyType] = (empty?.occurrenceTypes ?? []) as readonly Record<string, unknown>[]
        expect(emptyType).toMatchObject({
          declaredAmountMode: 'optional',
          declaredAmountScope: 'occurrence',
          itemsMode: 'required',
          referenceNumberMode: 'required',
        })
      })
    },
    60_000,
  )

  testWithPostgres(
    'uma consulta aos produtos para a viagem inteira, com uma nota ou com várias',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const repository = (db: TestDatabase['db']) => new DrizzleCurrentDriverTripRepository(db)
        const input = { companyId: world.company.companyId, driverId: world.company.firstDriverId }

        const few = countingDatabase(database.db)
        await repository(few.counted).listActiveTrips(input)

        for (let index = 0; index < 5; index += 1) {
          const documentId = await seedExtraDocument(database, world.company, world.trip, {
            separationStatus: 'loaded',
            stopId: world.trip.stopId,
          })
          const nfeId = await nfeDocumentIdOf(database, documentId)
          await seedProducts(database, world.company, nfeId)
        }
        const many = countingDatabase(database.db)
        await repository(many.counted).listActiveTrips(input)

        expect(few.productSelectCount()).toBe(1)
        expect(many.productSelectCount()).toBe(1)
      })
    },
    60_000,
  )

  testWithPostgres(
    'o documento serializado é o JSON de referência que o painel e o app do motorista leem',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)

        const documents = await readSnapshot(database, world)
        const big = documents.find((document) => document.id === world.trip.documentId)
        const golden = (await Bun.file(GOLDEN_URL).json()) as unknown

        expect({ ...big, id: 'DOCUMENT_ID' }).toEqual(golden as { id: string })
      })
    },
    60_000,
  )
})
