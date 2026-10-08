/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 258 T3.3, contra o Postgres: as opções do filtro do relatório saem do mesmo escopo de viagem da
 * lista e nunca do filtro de nota. Só a consulta executada pega uma junção sem `company_id`, um
 * `distinct` que deixa passar nota liberada ou um teto que não corta.
 */
import { describe, expect } from 'bun:test'

import { createListTripReportFacetsUseCase } from '../../src/trips/application/list-trip-report-facets.use-case.js'
import { TRIP_REPORT_FACET_LIMIT } from '../../src/trips/domain/trip-report.constant.js'
import type { TripReportFacetFilters } from '../../src/trips/domain/trip-report.types.js'
import { DrizzleTripReportRepository } from '../../src/trips/infrastructure/drizzle-trip-report.repository.js'
import {
  seedCompany,
  seedExtraDocument,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
  type Company,
  type SeededTrip,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import {
  decorateTripDocument,
  type ReportDocumentSeed,
} from '../fixtures/trip-report-database.fixture.js'

const ALFA = { emitterLegalName: 'Alfa Ltda', emitterTaxId: '11111111000111' } as const
const BETA = { emitterLegalName: 'Beta SA', emitterTaxId: '22222222000122' } as const
const GAMA = { emitterLegalName: 'Gama ME', emitterTaxId: '33333333000133' } as const

let documentCounter = 0

async function readFacets(database: TestDatabase, companyId: string, filters: object = {}) {
  const result = await createListTripReportFacetsUseCase({
    repository: new DrizzleTripReportRepository(database.db),
  })({ companyId, filters: filters as TripReportFacetFilters })
  return result.data
}

async function addDocument(
  database: TestDatabase,
  input: {
    readonly company: Company
    readonly releasedAt?: Date
    readonly seed: ReportDocumentSeed
    readonly trip: SeededTrip
  },
): Promise<void> {
  const tripDocumentId = await seedExtraDocument(database, input.company, input.trip, {
    ...(input.releasedAt === undefined ? {} : { releasedAt: input.releasedAt }),
    separationStatus: 'loaded',
  })
  await decorateTripDocument(database, {
    companyId: input.company.companyId,
    seed: { number: String((documentCounter += 1)), ...input.seed },
    tripDocumentId,
  })
}

function address(city: string, state: string) {
  return { city, district: 'Centro', number: '1', state, street: 'Rua A' }
}

async function seedTenant(database: TestDatabase, company: Company) {
  const openTrip = await seedTrip(database, company, 'in_transit')
  const otherTrip = await seedTrip(database, company, 'in_transit')
  const cancelledTrip = await seedTrip(database, company, 'cancelled')
  await addDocument(database, {
    company,
    seed: { ...ALFA, city: 'Campinas', emitterAddress: address('Recife', 'PE'), state: 'SP' },
    trip: openTrip,
  })
  await addDocument(database, {
    company,
    seed: { ...BETA, city: 'Niteroi', emitterAddress: address('Santos', 'SP'), state: 'RJ' },
    trip: otherTrip,
  })
  await addDocument(database, {
    company,
    seed: { ...GAMA, city: 'Manaus', emitterAddress: address('Belem', 'PA'), state: 'AM' },
    trip: cancelledTrip,
  })
  await addDocument(database, {
    company,
    releasedAt: new Date('2026-09-18T00:00:00.000Z'),
    seed: { ...GAMA, city: 'Natal', emitterAddress: address('Fortaleza', 'CE'), state: 'RN' },
    trip: openTrip,
  })
  return { openTrip, otherTrip }
}

describe('facetas do relatorio contra o Postgres (spec 258 T3.3)', () => {
  testWithPostgres(
    'cidades e UFs por lado, emitentes em pares, ordenados; viagem cancelada e nota liberada ficam fora',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        await seedTenant(database, company)

        const facets = await readFacets(database, company.companyId)

        expect(facets.cities).toEqual({
          emitter: ['Recife', 'Santos'],
          recipient: ['Campinas', 'Niteroi'],
        })
        expect(facets.states).toEqual({ emitter: ['PE', 'SP'], recipient: ['RJ', 'SP'] })
        expect(facets.emitters).toEqual([
          { name: 'Alfa Ltda', taxId: '11111111000111' },
          { name: 'Beta SA', taxId: '22222222000122' },
        ])
      })
    },
    120_000,
  )

  testWithPostgres(
    'filtros de viagem encolhem as opcoes; o escopo de outra empresa nunca entra',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const otherCompany = await seedCompany(database)
        const { openTrip } = await seedTenant(database, company)
        await seedTenant(database, otherCompany)

        const facets = await readFacets(database, company.companyId, {
          tripIdIn: [openTrip.tripId],
        })

        expect(facets.cities).toEqual({ emitter: ['Recife'], recipient: ['Campinas'] })
        expect(facets.emitters).toEqual([{ name: 'Alfa Ltda', taxId: '11111111000111' }])
        const unrelated = await readFacets(database, company.companyId, {
          tripIdIn: [crypto.randomUUID()],
        })
        expect(unrelated).toEqual({
          cities: { emitter: [], recipient: [] },
          emitters: [],
          states: { emitter: [], recipient: [] },
        })
      })
    },
    120_000,
  )

  testWithPostgres(
    'filtro de nota passado por engano e ignorado: as opcoes nao encolhem',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        await seedTenant(database, company)

        const facets = await readFacets(database, company.companyId, {
          emitterNameIn: ['Alfa Ltda'],
          emitterStateIn: ['PE'],
          numberFrom: '99999',
          recipientName: 'nenhum',
        })

        expect(facets.emitters.map((emitter) => emitter.name)).toEqual(['Alfa Ltda', 'Beta SA'])
        expect(facets.cities.recipient).toEqual(['Campinas', 'Niteroi'])
      })
    },
    120_000,
  )

  testWithPostgres(
    'cada lista corta no teto, ordenada',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const total = TRIP_REPORT_FACET_LIMIT + 1
        for (let index = 0; index < total; index += 1) {
          const suffix = String(index).padStart(4, '0')
          await addDocument(database, {
            company,
            seed: {
              city: `Cidade ${suffix}`,
              emitterAddress: address(`Origem ${suffix}`, 'SP'),
              emitterLegalName: `Emitente ${suffix}`,
              emitterTaxId: `9${suffix}0000000000`.slice(0, 14),
            },
            trip,
          })
        }

        const facets = await readFacets(database, company.companyId)

        expect(facets.cities.emitter).toHaveLength(TRIP_REPORT_FACET_LIMIT)
        expect(facets.cities.recipient).toHaveLength(TRIP_REPORT_FACET_LIMIT)
        expect(facets.emitters).toHaveLength(TRIP_REPORT_FACET_LIMIT)
        expect(facets.cities.emitter[0]).toBe('Origem 0000')
        expect(facets.emitters[0]?.name).toBe('Emitente 0000')
        expect(facets.states.emitter).toEqual(['SP'])
      })
    },
    300_000,
  )
})
