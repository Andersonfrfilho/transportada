/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 253 T2.2, contra o Postgres: o dublê do contrato não enxerga o SQL. Uma junção sem `company_id`,
 * um filtro que escapa para a memória ou um cursor que perde o desempate devolvem linhas erradas e
 * passam em todo teste com repositório em memória.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { tripDocuments, trips } from '../../src/database/database.schema.js'
import { createListTripReportUseCase } from '../../src/trips/application/list-trip-report.use-case.js'
import type { TripReportFilters } from '../../src/trips/domain/trip-report.types.js'
import { DrizzleTripReportRepository } from '../../src/trips/infrastructure/drizzle-trip-report.repository.js'
import {
  seedCompany,
  seedExtraDocument,
  seedNfeDocument,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import {
  decorateTripDocument,
  seedContractor,
  seedFreightLinkedDocument,
} from '../fixtures/trip-report-database.fixture.js'

const EMITTER_TAX_ID = '12345678000199'
const OTHER_TAX_ID = '55555555000155'

async function listAll(database: TestDatabase, companyId: string, filters: TripReportFilters = {}) {
  const result = await createListTripReportUseCase({
    repository: new DrizzleTripReportRepository(database.db),
  })({ canReadFinancials: true, companyId, query: { cursor: undefined, filters, limit: 100 } })
  return result
}

async function seedWorld(database: TestDatabase) {
  const company = await seedCompany(database)
  const otherCompany = await seedCompany(database)
  const contractorId = await seedContractor(database, {
    companyId: company.companyId,
    displayName: 'Alfa',
    taxId: EMITTER_TAX_ID,
  })
  await seedContractor(database, {
    companyId: otherCompany.companyId,
    displayName: 'Intruso',
    taxId: OTHER_TAX_ID,
  })

  const trip = await seedTrip(database, company, 'in_transit')
  const first = await decorateTripDocument(database, {
    companyId: company.companyId,
    seed: { emitterTaxId: EMITTER_TAX_ID, number: '12345', totalValue: '500.0000' },
    tripDocumentId: trip.documentId,
  })
  const secondTripDocumentId = await seedExtraDocument(database, company, trip, {
    returnReason: 'Recusa',
    separationStatus: 'returned',
  })
  const second = await decorateTripDocument(database, {
    companyId: company.companyId,
    seed: {
      city: 'Recife',
      emitterTaxId: OTHER_TAX_ID,
      number: '777',
      state: 'PE',
      totalValue: '50.0000',
    },
    tripDocumentId: secondTripDocumentId,
  })
  const releasedId = await seedExtraDocument(database, company, trip, {
    releasedAt: new Date('2026-09-18T00:00:00.000Z'),
    separationStatus: 'pending',
  })
  const cancelledTrip = await seedTrip(database, company, 'cancelled')
  const freightTrip = await seedTrip(database, company, 'draft')
  await database.db
    .update(tripDocuments)
    .set({ releasedAt: new Date('2026-09-18T00:00:00.000Z') })
    .where(eq(tripDocuments.id, freightTrip.documentId))
  const viaFreight = await seedFreightLinkedDocument(database, {
    company,
    seed: { emitterTaxId: EMITTER_TAX_ID, number: '999', totalValue: '100.0000' },
    trip: freightTrip,
  })
  const otherTrip = await seedTrip(database, otherCompany, 'in_transit')
  await decorateTripDocument(database, {
    companyId: otherCompany.companyId,
    seed: { emitterTaxId: EMITTER_TAX_ID, number: '12345' },
    tripDocumentId: otherTrip.documentId,
  })

  return {
    cancelledTrip,
    company,
    contractorId,
    first,
    freightTrip,
    otherCompany,
    releasedId,
    second,
    trip,
    viaFreight,
  }
}

describe('o relatorio de viagens contra o Postgres (spec 253 T2.2)', () => {
  testWithPostgres(
    'lista so notas vivas de viagens vivas da empresa, resolvendo a nota por frete tambem',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const result = await listAll(database, world.company.companyId)

        expect(result.page.total).toBe(3)
        expect(result.data.map((row) => row.documentNumber).sort()).toEqual(['12345', '777', '999'])
        const tripIds = new Set(result.data.map((row) => row.tripId))
        expect(tripIds.has(world.cancelledTrip.tripId)).toBe(false)
        const viaFreightRow = result.data.find((row) => row.documentNumber === '999')
        expect(viaFreightRow?.tone).toBe('warehouse')
        expect(viaFreightRow?.contractorName).toBe('Alfa')
        expect(JSON.stringify(result)).not.toContain('11999990000')
      })
    },
    120_000,
  )

  testWithPostgres(
    'contratante sem cadastro vem nulo e o cadastro de outra empresa nao casa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const rows = (await listAll(database, world.company.companyId)).data
        const byNumber = new Map(rows.map((row) => [row.documentNumber, row]))

        expect(byNumber.get('12345')?.contractorName).toBe('Alfa')
        expect(byNumber.get('777')?.contractorName).toBeNull()

        const withNone = await listAll(database, world.company.companyId, {
          contractorIdIn: { contractorIds: [], includesNone: true },
        })
        expect(withNone.data.map((row) => row.documentNumber)).toEqual(['777'])
        const onlyAlfa = await listAll(database, world.company.companyId, {
          contractorIdIn: { contractorIds: [world.contractorId], includesNone: false },
        })
        expect(onlyAlfa.data.map((row) => row.documentNumber).sort()).toEqual(['12345', '999'])
      })
    },
    120_000,
  )

  testWithPostgres(
    'filtros rodam no SQL: busca, cidade, UF, valor, status da nota e da viagem, ids',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const numbersFor = async (filters: TripReportFilters) =>
          (await listAll(database, world.company.companyId, filters)).data
            .map((row) => row.documentNumber)
            .sort()

        expect(await numbersFor({ search: '234' })).toEqual(['12345'])
        expect(await numbersFor({ search: '%' })).toEqual([])
        expect(await numbersFor({ recipientCityIn: ['Recife'] })).toEqual(['777'])
        expect(await numbersFor({ recipientStateIn: ['PE'] })).toEqual(['777'])
        expect(await numbersFor({ valueAmount: '100', valueOperator: 'gt' })).toEqual(['12345'])
        expect(await numbersFor({ valueAmount: '50', valueOperator: 'eq' })).toEqual(['777'])
        expect(await numbersFor({ documentStatusIn: ['returned'] })).toEqual(['777'])
        expect(await numbersFor({ statusIn: ['draft'] })).toEqual(['999'])
        expect(await numbersFor({ tripIdIn: [world.trip.tripId] })).toEqual(['12345', '777'])
        expect(
          await numbersFor({ documentIdIn: [world.first, world.viaFreight.nfeDocumentId] }),
        ).toEqual(['12345', '999'])
      })
    },
    120_000,
  )

  testWithPostgres(
    'periodo, nota liberada, viagem cancelada e notas sem viagem em documentIdIn',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        await database.db
          .update(trips)
          .set({ createdAt: new Date('2026-10-01T00:00:00.000Z') })
          .where(eq(trips.id, world.freightTrip.tripId))

        const recent = await listAll(database, world.company.companyId, {
          createdFrom: '2026-09-30T00:00:00.000Z',
        })
        expect(recent.data.map((row) => row.documentNumber)).toEqual(['999'])

        const stray = await listAll(database, world.company.companyId, {
          documentIdIn: [world.first, world.second],
        })
        expect(stray.excludedWithoutTrip).toBe(0)
        const withCancelled = await new DrizzleTripReportRepository(
          database.db,
        ).countDocumentsWithoutTrip({
          companyId: world.company.companyId,
          documentIds: [world.otherCompany.userId, world.first],
        })
        expect(withCancelled).toBe(0)
      })
    },
    120_000,
  )

  testWithPostgres(
    'documentIdIn com notas sem viagem: sao contadas em excludedWithoutTrip (RF9), sem vazar de outra empresa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const strayId = await seedNfeDocument(database, world.company)
        const otherCompanyStrayId = await seedNfeDocument(database, world.otherCompany)
        const [cancelledLink] = await database.db
          .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
          .from(tripDocuments)
          .where(eq(tripDocuments.id, world.cancelledTrip.documentId))
        const cancelledNfeId = cancelledLink?.nfeDocumentId ?? ''

        const result = await listAll(database, world.company.companyId, {
          documentIdIn: [world.first, strayId, cancelledNfeId, otherCompanyStrayId],
        })

        expect(result.data.map((row) => row.documentNumber)).toEqual(['12345'])
        expect(result.page.total).toBe(1)
        expect(result.excludedWithoutTrip).toBe(2)
      })
    },
    120_000,
  )

  testWithPostgres(
    'o cursor percorre as paginas sem repetir nem pular, inclusive com created_at igual',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const execute = createListTripReportUseCase({
          repository: new DrizzleTripReportRepository(database.db),
        })
        const seen: string[] = []
        let cursor: string | null | undefined
        do {
          const page = await execute({
            canReadFinancials: false,
            companyId: world.company.companyId,
            query: {
              cursor: toCursor(cursor),
              filters: {},
              limit: 1,
            },
          })
          seen.push(...page.data.map((row) => row.documentNumber))
          cursor = page.page.nextCursor
        } while (cursor !== null && cursor !== undefined)

        expect(seen.sort()).toEqual(['12345', '777', '999'])
        expect(new Set(seen).size).toBe(3)
      })
    },
    120_000,
  )

  testWithPostgres(
    'empresa isolada: a outra empresa so enxerga a propria nota',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const other = await listAll(database, world.otherCompany.companyId)

        expect(other.data.map((row) => row.documentNumber)).toEqual(['12345'])
        expect(other.data[0]?.contractorName).toBeNull()
        expect(other.page.total).toBe(1)
      })
    },
    120_000,
  )
})

function toCursor(raw: string | null | undefined) {
  if (raw === null || raw === undefined) return undefined
  const [createdAt = '', tripId = '', tripDocumentId = ''] = raw.split('::')
  return { createdAt, tripDocumentId, tripId }
}
