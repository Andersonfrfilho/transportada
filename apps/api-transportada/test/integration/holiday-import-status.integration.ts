/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.1 (ADR-0100 §3, "A exceção do companyId"): o status da importação lê as tabelas por empresa e
 * só AGREGA o cache global para as cidades da própria empresa. Duas empresas com o cache de uma cidade
 * em comum e outra só da B: a A nunca vê a data de busca, a falha nem a remoção da cidade que não é dela.
 */
import { describe, expect, test } from 'bun:test'

import { DrizzleHolidayImportStatusRepository } from '../../src/business-calendar/infrastructure/drizzle-holiday-import-status.repository.js'
import {
  companyHolidayImportSettings,
  holidayImportCities,
  holidayProviderFetches,
  holidayProviderMonthlyUsage,
  jobExecutions,
} from '../../src/database/database.schema.js'
import type { JobOutcome } from '../../src/shared/job-catalog.constant.js'
import {
  CAMPINAS,
  databaseUrl,
  seedTenant,
  withBusinessCalendarDatabase,
  type TestDatabase,
  type Tenant,
} from '../fixtures/business-calendar-database.fixture.js'
import {
  seedImportedMunicipalHoliday,
  seedImportedStateHoliday,
} from '../fixtures/holiday-import-database.fixture.js'

const testWithPostgres = databaseUrl === undefined ? test.skip : test
const SANTOS = '3548500'
const RIBEIRAO_PRETO = '3543402'
const SAO_PAULO_STATE = '35'
const YEARS = { fromYear: 2026, toYear: 2027 } as const
const MONTH = '2026-10-01'
const TODAY = '2026-10-09'
const CAMPINAS_FETCHED_AT = new Date('2026-10-01T10:00:00.000Z')
const FOREIGN_FETCHED_AT = new Date('2026-10-08T10:00:00.000Z')

async function seedDemand(
  database: TestDatabase,
  tenant: Tenant,
  cities: readonly (readonly [string, number])[],
): Promise<void> {
  for (const [cityIbgeCode, documentCount] of cities) {
    await database.db
      .insert(holidayImportCities)
      .values({ cityIbgeCode, companyId: tenant.companyId, documentCount })
  }
}

type SeedFetchParams = {
  readonly attempts?: number
  readonly cityIbgeCode: string
  readonly fetchedAt?: Date
  readonly lastErrorCode?: string
  readonly nextAttemptAt?: Date
  readonly status: 'done' | 'failed' | 'not_covered' | 'pending' | 'quota_exhausted'
  readonly year: number
}

async function seedFetch(database: TestDatabase, params: SeedFetchParams): Promise<void> {
  await database.db.insert(holidayProviderFetches).values({
    attempts: params.attempts ?? 0,
    ibgeCode: params.cityIbgeCode,
    scope: 'city',
    status: params.status,
    year: params.year,
    ...(params.fetchedAt === undefined ? {} : { fetchedAt: params.fetchedAt }),
    ...(params.lastErrorCode === undefined ? {} : { lastErrorCode: params.lastErrorCode }),
    ...(params.nextAttemptAt === undefined ? {} : { nextAttemptAt: params.nextAttemptAt }),
  })
}

async function seedTwoTenants(database: TestDatabase) {
  const tenantA = await seedTenant(database)
  const tenantB = await seedTenant(database)
  await seedDemand(database, tenantA, [
    [CAMPINAS, 10],
    [SANTOS, 3],
  ])
  await seedDemand(database, tenantB, [
    [CAMPINAS, 5],
    [RIBEIRAO_PRETO, 7],
  ])
  await seedFetch(database, {
    attempts: 1,
    cityIbgeCode: CAMPINAS,
    fetchedAt: CAMPINAS_FETCHED_AT,
    status: 'done',
    year: 2026,
  })
  await seedFetch(database, { cityIbgeCode: CAMPINAS, status: 'pending', year: 2027 })
  await seedFetch(database, { cityIbgeCode: CAMPINAS, status: 'done', year: 2025 })
  await seedFetch(database, {
    attempts: 2,
    cityIbgeCode: SANTOS,
    lastErrorCode: 'provider_unreachable',
    nextAttemptAt: new Date('2026-10-09T12:00:00.000Z'),
    status: 'failed',
    year: 2026,
  })
  await seedFetch(database, {
    attempts: 1,
    cityIbgeCode: RIBEIRAO_PRETO,
    fetchedAt: FOREIGN_FETCHED_AT,
    lastErrorCode: 'malformed_response',
    status: 'failed',
    year: 2026,
  })
  await database.db.insert(holidayProviderMonthlyUsage).values([
    { month: MONTH, requests: 37 },
    { month: '2026-09-01', requests: 99 },
  ])
  return { tenantA, tenantB }
}

describe('o status da importação agrega o cache só para as cidades da empresa (spec 252 T4.1)', () => {
  testWithPostgres(
    'conta os pares cidade×ano do horizonte, sem a cidade da outra empresa',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const { tenantA, tenantB } = await seedTwoTenants(database)
        const repository = new DrizzleHolidayImportStatusRepository(database.db)

        const statusA = await repository.readStatus({
          companyId: tenantA.companyId,
          month: MONTH,
          today: TODAY,
          years: YEARS,
        })
        const statusB = await repository.readStatus({
          companyId: tenantB.companyId,
          month: MONTH,
          today: TODAY,
          years: YEARS,
        })

        expect(statusA).toMatchObject({
          failures: [{ errorCode: 'provider_unreachable', pairs: 1 }],
          isEnabled: true,
          lastFetchedAt: CAMPINAS_FETCHED_AT,
          month: MONTH,
          monthlyRequests: 37,
          pairs: { done: 1, failed: 1, notCovered: 0, pending: 2, quotaExhausted: 0, total: 4 },
          totalCities: 2,
        })
        expect(statusB).toMatchObject({
          failures: [{ errorCode: 'malformed_response', pairs: 1 }],
          lastFetchedAt: FOREIGN_FETCHED_AT,
          pairs: { done: 1, failed: 1, pending: 2, total: 4 },
          totalCities: 2,
        })
      })
    },
  )

  testWithPostgres(
    'empresa sem demanda: tudo zerado, e o orçamento do mês continua visível',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        await seedTwoTenants(database)
        const empty = await seedTenant(database)
        const repository = new DrizzleHolidayImportStatusRepository(database.db)

        const status = await repository.readStatus({
          companyId: empty.companyId,
          month: MONTH,
          today: TODAY,
          years: YEARS,
        })

        expect(status).toMatchObject({
          failures: [],
          lastFetchedAt: null,
          monthlyRequests: 37,
          pairs: { done: 0, failed: 0, notCovered: 0, pending: 0, quotaExhausted: 0, total: 0 },
          totalCities: 0,
        })
      })
    },
  )

  testWithPostgres('mês sem linha de orçamento é zero, não erro', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleHolidayImportStatusRepository(database.db)

      const status = await repository.readStatus({
        companyId: tenant.companyId,
        month: MONTH,
        today: TODAY,
        years: YEARS,
      })

      expect(status.monthlyRequests).toBe(0)
    })
  })

  testWithPostgres('isEnabled sai da configuração da empresa; sem linha é ligado', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const disabled = await seedTenant(database)
      const unset = await seedTenant(database)
      await database.db
        .insert(companyHolidayImportSettings)
        .values({ companyId: disabled.companyId, isEnabled: false })
      const repository = new DrizzleHolidayImportStatusRepository(database.db)
      const read = (tenant: Tenant) =>
        repository.readStatus({
          companyId: tenant.companyId,
          month: MONTH,
          today: TODAY,
          years: YEARS,
        })

      expect((await read(disabled)).isEnabled).toBe(false)
      expect((await read(unset)).isEnabled).toBe(true)
    })
  })

  testWithPostgres(
    'os removidos pelo fornecedor são só as linhas da própria empresa cujo cache perdeu a data',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenantA = await seedTenant(database)
        const tenantB = await seedTenant(database)
        const removedAt = new Date('2026-10-05T00:00:00.000Z')
        const removedCity = await seedImportedMunicipalHoliday(database, tenantA, {
          holidayOn: '2026-11-20',
          ibgeCode: CAMPINAS,
          name: 'Removido da cidade',
          removedAt,
        })
        const removedState = await seedImportedStateHoliday(database, tenantA, {
          holidayOn: '2026-12-08',
          ibgeCode: SAO_PAULO_STATE,
          name: 'Removido do estado',
          removedAt,
        })
        await seedImportedMunicipalHoliday(database, tenantA, {
          holidayOn: '2026-12-09',
          ibgeCode: CAMPINAS,
          name: 'Ainda vigente',
        })
        await seedImportedMunicipalHoliday(database, tenantB, {
          holidayOn: '2026-11-21',
          ibgeCode: CAMPINAS,
          name: 'Removido, mas da B',
          removedAt,
        })
        const repository = new DrizzleHolidayImportStatusRepository(database.db)

        const status = await repository.readStatus({
          companyId: tenantA.companyId,
          month: MONTH,
          today: TODAY,
          years: YEARS,
        })

        expect(status.removedByProvider.truncated).toBe(false)
        expect(status.removedByProvider.items).toEqual([
          {
            holidayId: removedCity.id,
            holidayOn: '2026-11-20',
            ibgeCode: CAMPINAS,
            name: 'Removido da cidade',
            scope: 'city',
          },
          {
            holidayId: removedState.id,
            holidayOn: '2026-12-08',
            ibgeCode: SAO_PAULO_STATE,
            name: 'Removido do estado',
            scope: 'state',
          },
        ])
      })
    },
  )
})

type SeedExecutionParams = {
  readonly finishedAt?: Date
  readonly job: 'holiday.provider.pull' | 'nfe.recipient-email.backfill'
  readonly outcome?: JobOutcome
  readonly startedAt: Date
}

async function seedExecution(database: TestDatabase, params: SeedExecutionParams): Promise<void> {
  await database.db.insert(jobExecutions).values({
    correlationId: `holiday-status-${params.startedAt.toISOString()}`,
    job: params.job,
    origin: 'schedule',
    startedAt: params.startedAt,
    ...(params.finishedAt === undefined ? {} : { finishedAt: params.finishedAt }),
    ...(params.outcome === undefined ? {} : { outcome: params.outcome }),
  })
}

describe('a última execução da rotina e os pares fora do plano (spec 252, cartão de status honesto)', () => {
  testWithPostgres(
    'lastRun é a última execução ENCERRADA da rotina: ignora a aberta e a de outra rotina',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const finishedAt = new Date('2026-10-09T11:05:00.000Z')
        await seedExecution(database, {
          finishedAt: new Date('2026-10-09T09:05:00.000Z'),
          job: 'holiday.provider.pull',
          outcome: 'provider_unreachable',
          startedAt: new Date('2026-10-09T09:00:00.000Z'),
        })
        await seedExecution(database, {
          finishedAt,
          job: 'holiday.provider.pull',
          outcome: 'provider_unauthorized',
          startedAt: new Date('2026-10-09T11:00:00.000Z'),
        })
        await seedExecution(database, {
          finishedAt: new Date('2026-10-09T12:05:00.000Z'),
          job: 'nfe.recipient-email.backfill',
          outcome: 'succeeded',
          startedAt: new Date('2026-10-09T12:00:00.000Z'),
        })
        await seedExecution(database, {
          job: 'holiday.provider.pull',
          startedAt: new Date('2026-10-09T13:00:00.000Z'),
        })
        const repository = new DrizzleHolidayImportStatusRepository(database.db)

        const status = await repository.readStatus({
          companyId: tenant.companyId,
          month: MONTH,
          today: TODAY,
          years: YEARS,
        })

        expect(status.lastRun).toEqual({ finishedAt, outcome: 'provider_unauthorized' })
      })
    },
  )

  testWithPostgres('sem nenhum ciclo encerrado da rotina, lastRun é null', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      await seedExecution(database, {
        finishedAt: new Date('2026-10-09T12:05:00.000Z'),
        job: 'nfe.recipient-email.backfill',
        outcome: 'succeeded',
        startedAt: new Date('2026-10-09T12:00:00.000Z'),
      })
      const repository = new DrizzleHolidayImportStatusRepository(database.db)

      const status = await repository.readStatus({
        companyId: tenant.companyId,
        month: MONTH,
        today: TODAY,
        years: YEARS,
      })

      expect(status.lastRun).toBeNull()
    })
  })

  testWithPostgres(
    'planRestricted conta só os pares da empresa com esse código, sem os da outra empresa nem outros erros',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const { tenantA, tenantB } = await seedTwoTenants(database)
        await seedFetch(database, {
          cityIbgeCode: SANTOS,
          lastErrorCode: 'provider_plan_restricted',
          status: 'failed',
          year: 2027,
        })
        await seedFetch(database, {
          cityIbgeCode: RIBEIRAO_PRETO,
          lastErrorCode: 'provider_plan_restricted',
          status: 'failed',
          year: 2027,
        })
        const repository = new DrizzleHolidayImportStatusRepository(database.db)
        const read = (tenant: Tenant) =>
          repository.readStatus({
            companyId: tenant.companyId,
            month: MONTH,
            today: TODAY,
            years: YEARS,
          })

        const statusA = await read(tenantA)
        const statusB = await read(tenantB)

        expect(statusA.pairs.planRestricted).toBe(1)
        expect(statusA.pairs.failed).toBe(2)
        expect(statusA.pairs.pending).toBe(1)
        expect(statusB.pairs.planRestricted).toBe(1)
      })
    },
  )

  testWithPostgres('sem par fora do plano, planRestricted é 0', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const { tenantA } = await seedTwoTenants(database)
      const repository = new DrizzleHolidayImportStatusRepository(database.db)

      const status = await repository.readStatus({
        companyId: tenantA.companyId,
        month: MONTH,
        today: TODAY,
        years: YEARS,
      })

      expect(status.pairs.planRestricted).toBe(0)
    })
  })
})

describe('os removidos pelo fornecedor são só os de hoje em diante (spec 252 T6.1b)', () => {
  testWithPostgres(
    'data passada não ocupa a lista: o botão "Desligar" dela sempre daria 409 (D7)',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const removedAt = new Date('2026-10-05T00:00:00.000Z')
        await seedImportedMunicipalHoliday(database, tenant, {
          holidayOn: '2026-10-08',
          ibgeCode: CAMPINAS,
          name: 'Removido ontem',
          removedAt,
        })
        await seedImportedStateHoliday(database, tenant, {
          holidayOn: '2026-01-01',
          ibgeCode: SAO_PAULO_STATE,
          name: 'Removido há meses',
          removedAt,
        })
        const today = await seedImportedMunicipalHoliday(database, tenant, {
          holidayOn: TODAY,
          ibgeCode: CAMPINAS,
          name: 'Removido para hoje',
          removedAt,
        })
        const later = await seedImportedStateHoliday(database, tenant, {
          holidayOn: '2026-12-08',
          ibgeCode: SAO_PAULO_STATE,
          name: 'Removido para dezembro',
          removedAt,
        })
        const repository = new DrizzleHolidayImportStatusRepository(database.db)

        const status = await repository.readStatus({
          companyId: tenant.companyId,
          month: MONTH,
          today: TODAY,
          years: YEARS,
        })

        expect(status.removedByProvider.items.map((item) => item.holidayId)).toEqual([
          today.id,
          later.id,
        ])
        expect(status.removedByProvider.truncated).toBe(false)
      })
    },
  )

  testWithPostgres(
    '201 passadas não cortam as futuras: o teto conta só o que aparece',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const removedAt = new Date('2026-10-05T00:00:00.000Z')
        for (let day = 0; day < 201; day += 1) {
          await seedImportedMunicipalHoliday(database, tenant, {
            holidayOn: new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10),
            ibgeCode: CAMPINAS,
            removedAt,
          })
        }
        const future = await seedImportedStateHoliday(database, tenant, {
          holidayOn: '2026-12-08',
          ibgeCode: SAO_PAULO_STATE,
          removedAt,
        })
        const repository = new DrizzleHolidayImportStatusRepository(database.db)

        const status = await repository.readStatus({
          companyId: tenant.companyId,
          month: MONTH,
          today: TODAY,
          years: YEARS,
        })

        expect(status.removedByProvider.items.map((item) => item.holidayId)).toEqual([future.id])
        expect(status.removedByProvider.truncated).toBe(false)
      })
    },
    120_000,
  )
})

describe('o teto da lista de removidos é um só, depois de juntar cidade e estado (spec 252 T4.1, L2)', () => {
  testWithPostgres(
    '201 removidos (150 de cidade + 51 de estado) saem 200 e `truncated: true`',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const removedAt = new Date('2026-10-05T00:00:00.000Z')
        for (let day = 0; day < 150; day += 1) {
          await seedImportedMunicipalHoliday(database, tenant, {
            holidayOn: new Date(Date.UTC(2027, 0, 1 + day)).toISOString().slice(0, 10),
            ibgeCode: CAMPINAS,
            removedAt,
          })
        }
        for (let day = 0; day < 51; day += 1) {
          await seedImportedStateHoliday(database, tenant, {
            holidayOn: new Date(Date.UTC(2028, 0, 1 + day)).toISOString().slice(0, 10),
            ibgeCode: SAO_PAULO_STATE,
            removedAt,
          })
        }
        const repository = new DrizzleHolidayImportStatusRepository(database.db)

        const status = await repository.readStatus({
          companyId: tenant.companyId,
          month: MONTH,
          today: TODAY,
          years: YEARS,
        })

        expect(status.removedByProvider.items).toHaveLength(200)
        expect(status.removedByProvider.truncated).toBe(true)
        expect(status.removedByProvider.items.at(-1)?.holidayOn).toBe('2028-02-19')
      })
    },
    120_000,
  )
})

describe('as cidades da empresa com o estado do cache (spec 252 T4.1)', () => {
  testWithPostgres(
    'por volume de notas, os dois anos do horizonte, sem a cidade alheia',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const { tenantA } = await seedTwoTenants(database)
        const repository = new DrizzleHolidayImportStatusRepository(database.db)

        const page = await repository.listCities({
          companyId: tenantA.companyId,
          page: 1,
          perPage: 50,
          years: YEARS,
        })

        expect(page.total).toBe(2)
        expect(page.items.map((city) => [city.cityIbgeCode, city.documentCount])).toEqual([
          [CAMPINAS, 10],
          [SANTOS, 3],
        ])
        expect(page.items[0]?.years).toEqual([
          {
            attempts: 1,
            errorCode: null,
            fetchedAt: CAMPINAS_FETCHED_AT,
            nextAttemptAt: null,
            status: 'done',
            year: 2026,
          },
          {
            attempts: 0,
            errorCode: null,
            fetchedAt: null,
            nextAttemptAt: null,
            status: 'pending',
            year: 2027,
          },
        ])
        expect(page.items[1]?.years).toEqual([
          {
            attempts: 2,
            errorCode: 'provider_unreachable',
            fetchedAt: null,
            nextAttemptAt: new Date('2026-10-09T12:00:00.000Z'),
            status: 'failed',
            year: 2026,
          },
          {
            attempts: 0,
            errorCode: null,
            fetchedAt: null,
            nextAttemptAt: null,
            status: 'pending',
            year: 2027,
          },
        ])
      })
    },
  )

  testWithPostgres('pagina por posição: a segunda página de 1 é a segunda cidade', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const { tenantA } = await seedTwoTenants(database)
      const repository = new DrizzleHolidayImportStatusRepository(database.db)

      const second = await repository.listCities({
        companyId: tenantA.companyId,
        page: 2,
        perPage: 1,
        years: YEARS,
      })

      expect(second.total).toBe(2)
      expect(second.items.map((city) => city.cityIbgeCode)).toEqual([SANTOS])
    })
  })
})
