/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 258 T3.2, contra o Postgres: os filtros de nota do relatório de viagens têm de devolver o que a
 * aba de notas devolve. O contrato de SQL não pega um `::numeric` sobre texto, um dia UTC errado ou um
 * vínculo de lote de outra empresa — só a consulta executada pega.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { tripDocuments } from '../../src/database/database.schema.js'
import { createListTripReportUseCase } from '../../src/trips/application/list-trip-report.use-case.js'
import type { TripReportFilters } from '../../src/trips/domain/trip-report.types.js'
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
  seedCteBatchLink,
  type ReportDocumentSeed,
} from '../fixtures/trip-report-database.fixture.js'

const ALFA = { emitterLegalName: 'Alfa Ltda', emitterTaxId: '11111111000111' } as const
const BETA = { emitterLegalName: 'Beta SA', emitterTaxId: '22222222000122' } as const
const RECIPIENT_ADDRESS = { district: 'Jardim', number: '50', street: 'Rua das Flores' } as const

async function numbersFor(
  database: TestDatabase,
  companyId: string,
  filters: TripReportFilters,
): Promise<readonly string[]> {
  const result = await createListTripReportUseCase({
    repository: new DrizzleTripReportRepository(database.db),
  })({ canReadFinancials: true, companyId, query: { cursor: undefined, filters, limit: 100 } })
  expect(result.page.total).toBe(result.data.length)
  return result.data.map((row) => row.documentNumber).sort()
}

async function addDocument(
  database: TestDatabase,
  input: {
    readonly company: Company
    readonly seed: ReportDocumentSeed
    readonly separationStatus?: 'loaded' | 'pending' | 'returned'
    readonly trip: SeededTrip
  },
): Promise<string> {
  const { company, seed, trip } = input
  const tripDocumentId = await seedExtraDocument(database, company, trip, {
    ...(input.separationStatus === 'returned' ? { returnReason: 'Recusa' } : {}),
    separationStatus: input.separationStatus ?? 'loaded',
  })
  return decorateTripDocument(database, { companyId: company.companyId, seed, tripDocumentId })
}

async function seedTenant(database: TestDatabase, company: Company) {
  const trip = await seedTrip(database, company, 'in_transit')
  await database.db
    .update(tripDocuments)
    .set({ releasedAt: new Date('2026-09-18T00:00:00.000Z') })
    .where(eq(tripDocuments.id, trip.documentId))
  const documents = {
    five: await addDocument(database, {
      company,
      seed: {
        ...ALFA,
        emitterAddress: {
          city: 'Recife',
          district: 'Centro',
          number: '10',
          state: 'PE',
          street: 'Rua A',
        },
        issuedAt: new Date('2026-09-30T12:00:00.000Z'),
        number: '5',
        recipientAddress: RECIPIENT_ADDRESS,
        recipientName: 'Mercado Sol',
      },
      trip,
    }),
    hundred: await addDocument(database, {
      company,
      seed: {
        ...ALFA,
        emitterAddress: {
          city: 'Recife',
          district: 'Centro',
          number: '10',
          state: 'PE',
          street: 'Rua A',
        },
        issuedAt: new Date('2026-10-01T23:30:00.000Z'),
        number: '100',
        recipientAddress: RECIPIENT_ADDRESS,
        recipientName: 'Mercado Sol',
      },
      separationStatus: 'returned',
      trip,
    }),
    eleven: await addDocument(database, {
      company,
      seed: {
        ...BETA,
        emitterAddress: {
          city: 'Santos',
          district: 'Vila',
          number: '7',
          state: 'SP',
          street: 'Rua B',
        },
        fiscalStatus: 'cancelled',
        issuedAt: new Date('2026-10-02T00:00:00.000Z'),
        number: '11',
        recipientAddress: { district: 'Centro', number: '1', street: 'Rua Lua' },
        recipientName: 'Padaria Lua',
      },
      separationStatus: 'pending',
      trip,
    }),
    threeHundred: await addDocument(database, {
      company,
      seed: {
        ...BETA,
        emitterAddress: {
          city: 'Santos',
          district: 'Vila',
          number: '7',
          state: 'SP',
          street: 'Rua B',
        },
        issuedAt: new Date('2026-10-03T08:00:00.000Z'),
        number: '300',
        recipientAddress: { ...RECIPIENT_ADDRESS, number: '51' },
        recipientName: 'Mercado Sol',
      },
      trip,
    }),
  }
  return { documents }
}

async function seedWorld(database: TestDatabase) {
  const company = await seedCompany(database)
  const otherCompany = await seedCompany(database)
  const world = await seedTenant(database, company)
  const other = await seedTenant(database, otherCompany)
  return { company, other, otherCompany, ...world }
}

describe('filtros de nota do relatorio contra o Postgres (spec 258 T3.2)', () => {
  testWithPostgres(
    'numero: faixa numerica, lados opcionais e o numero e comparado como numero, nao como texto',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { company } = await seedWorld(database)
        const id = company.companyId
        expect(await numbersFor(database, id, { numberFrom: '10', numberTo: '100' })).toEqual([
          '100',
          '11',
        ])
        expect(await numbersFor(database, id, { numberFrom: '10' })).toEqual(['100', '11', '300'])
        expect(await numbersFor(database, id, { numberTo: '99' })).toEqual(['11', '5'])
      })
    },
    120_000,
  )

  testWithPostgres(
    'data de emissao: intervalo semiaberto em UTC, cada lado opcional',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { company } = await seedWorld(database)
        const id = company.companyId
        const day = { issuedFrom: '2026-10-01', issuedUntil: '2026-10-01' }
        expect(await numbersFor(database, id, day)).toEqual(['100'])
        expect(await numbersFor(database, id, { issuedUntil: '2026-10-02' })).toEqual([
          '100',
          '11',
          '5',
        ])
        expect(await numbersFor(database, id, { issuedFrom: '2026-10-02' })).toEqual(['11', '300'])
      })
    },
    120_000,
  )

  testWithPostgres(
    'emitente: razao social (nunca fantasia), CNPJ com mascara, cidade, UF e endereco composto',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { company } = await seedWorld(database)
        const id = company.companyId
        expect(await numbersFor(database, id, { emitterNameIn: ['Alfa Ltda'] })).toEqual([
          '100',
          '5',
        ])
        expect(await numbersFor(database, id, { emitterNameIn: ['Fantasia Comum'] })).toEqual([])
        expect(await numbersFor(database, id, { emitterTaxIdIn: ['22.222.222/0001-22'] })).toEqual([
          '11',
          '300',
        ])
        expect(await numbersFor(database, id, { emitterCityIn: ['Santos'] })).toEqual(['11', '300'])
        expect(await numbersFor(database, id, { emitterStateIn: ['PE'] })).toEqual(['100', '5'])
        expect(await numbersFor(database, id, { emitterAddress: 'rua b, 7 - vila' })).toEqual([
          '11',
          '300',
        ])
        expect(await numbersFor(database, id, { emitterAddress: '%' })).toEqual([])
      })
    },
    120_000,
  )

  testWithPostgres(
    'destinatario: razao social e endereco composto',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { company } = await seedWorld(database)
        const id = company.companyId
        expect(await numbersFor(database, id, { recipientName: 'mercado' })).toEqual([
          '100',
          '300',
          '5',
        ])
        expect(await numbersFor(database, id, { recipientAddress: 'flores, 50 - jardim' })).toEqual(
          ['100', '5'],
        )
      })
    },
    120_000,
  )

  testWithPostgres(
    'situacao fiscal e CT-e emitido/pendente (autorizada com vinculo em lote nao cancelado)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { company, documents } = await seedWorld(database)
        const id = company.companyId
        expect(await numbersFor(database, id, { fiscalStatusIn: ['cancelled'] })).toEqual(['11'])
        expect(
          await numbersFor(database, id, { fiscalStatusIn: ['authorized', 'denied'] }),
        ).toEqual(['100', '300', '5'])

        await seedCteBatchLink(database, {
          batchStatus: 'done',
          company,
          nfeDocumentId: documents.five,
        })
        await seedCteBatchLink(database, {
          batchStatus: 'cancelled',
          company,
          nfeDocumentId: documents.hundred,
        })
        await seedCteBatchLink(database, {
          batchStatus: 'done',
          company,
          nfeDocumentId: documents.eleven,
        })
        expect(await numbersFor(database, id, { cteIssued: 'issued' })).toEqual(['5'])
        expect(await numbersFor(database, id, { cteIssued: 'pending' })).toEqual([
          '100',
          '11',
          '300',
        ])
      })
    },
    120_000,
  )

  testWithPostgres(
    'combinacao e situacao de entrega so dentro do conjunto filtrado, com total coerente',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { company } = await seedWorld(database)
        const id = company.companyId
        expect(
          await numbersFor(database, id, {
            emitterNameIn: ['Alfa Ltda'],
            numberFrom: '10',
            recipientName: 'mercado',
          }),
        ).toEqual(['100'])
        const inRange = {
          documentStatusIn: ['returned'],
          numberFrom: '10',
          numberTo: '100',
        } as const
        expect(await numbersFor(database, id, inRange)).toEqual(['100'])
        expect(await numbersFor(database, id, { ...inRange, numberTo: '99' })).toEqual([])
        expect(
          await numbersFor(database, id, { documentStatusIn: ['pending'], numberTo: '99' }),
        ).toEqual(['11'])
      })
    },
    120_000,
  )

  testWithPostgres(
    'isolamento: nota, endereco e lote de outra empresa nunca entram',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { company, other, otherCompany } = await seedWorld(database)
        await seedCteBatchLink(database, {
          batchStatus: 'done',
          company: otherCompany,
          nfeDocumentId: other.documents.threeHundred,
        })
        const everything: TripReportFilters = {
          emitterNameIn: ['Beta SA'],
          emitterStateIn: ['SP'],
          numberFrom: '300',
        }
        expect(
          await numbersFor(database, company.companyId, { ...everything, cteIssued: 'issued' }),
        ).toEqual([])
        expect(
          await numbersFor(database, company.companyId, { ...everything, cteIssued: 'pending' }),
        ).toEqual(['300'])
        expect(
          await numbersFor(database, otherCompany.companyId, {
            ...everything,
            cteIssued: 'issued',
          }),
        ).toEqual(['300'])
      })
    },
    120_000,
  )
})
