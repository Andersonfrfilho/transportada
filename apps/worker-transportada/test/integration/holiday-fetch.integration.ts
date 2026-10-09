/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T3.3 contra Postgres: a busca no fornecedor com o repositório real e um fornecedor falso
 * (nenhum teste chama a internet). Prova o SQL que os contratos não alcançam: a ordem pela demanda, o
 * upsert do orçamento do mês, o cache global, `removed_at` e o ciclo repetido sem nenhuma escrita.
 * Cada teste usa anos próprios (2030 a 2040) e os limpa antes: o cache global é compartilhado, e os
 * testes da aplicação (T3.4) usam outros anos.
 */
import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { createFetchHolidayProviderUseCase } from '../../src/holiday-provider-pull/application/fetch-holiday-provider.use-case.js'
import type { HolidayProviderPage } from '../../src/holiday-provider-pull/application/holiday-provider-client.port.js'
import {
  HOLIDAY_PROVIDER_ERROR_CODE,
  HolidayProviderError,
} from '../../src/holiday-provider-pull/domain/holiday-provider.error.js'
import type {
  HolidayProviderRequest,
  ProviderHolidayEntry,
} from '../../src/holiday-provider-pull/domain/holiday-provider.types.js'
import { createDrizzleHolidayFetchStore } from '../../src/holiday-provider-pull/infrastructure/drizzle-holiday-fetch.store.js'
import { buildFakeClock, buildScriptedClient } from '../fixtures/holiday-fetch.fixture.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const noop = () => undefined
const SILENT_LOGGER = { debug: noop, error: noop, info: noop, warn: noop } as never
const DAY_MS = 86_400_000

function randomCityCode(): string {
  return `35${String(Math.floor(Math.random() * 90_000) + 10_000)}`
}

function entryOf(
  input: Pick<ProviderHolidayEntry, 'date' | 'ibgeCode' | 'scope'> & Partial<ProviderHolidayEntry>,
): ProviderHolidayEntry {
  const providerType =
    input.scope === 'city' ? 'MUNICIPAL' : input.scope === 'state' ? 'ESTADUAL' : 'NACIONAL'
  return {
    externalId: null,
    isBanking: false,
    name: `Feriado ${input.date}`,
    providerType,
    ...input,
  }
}

function pageOf(entries: readonly ProviderHolidayEntry[]): HolidayProviderPage {
  return { entries, receivedCount: entries.length }
}

/** Município em 14/07, facultativo em 17/02 e o estadual de SP dentro da resposta da cidade. */
function standardResponse(request: HolidayProviderRequest): HolidayProviderPage {
  const { year } = request
  if (request.scope === 'national') {
    return pageOf([
      entryOf({ date: `${year}-01-01`, ibgeCode: 'BR', scope: 'national' }),
      entryOf({ date: `${year}-12-25`, ibgeCode: 'BR', scope: 'national' }),
    ])
  }
  if (request.scope === 'state') {
    return pageOf([entryOf({ date: `${year}-07-09`, ibgeCode: request.ibgeCode, scope: 'state' })])
  }
  return pageOf([
    entryOf({ date: `${year}-07-14`, ibgeCode: request.ibgeCode, scope: 'city' }),
    entryOf({
      date: `${year}-02-17`,
      ibgeCode: request.ibgeCode,
      providerType: 'FACULTATIVO',
      scope: 'city',
    }),
    entryOf({ date: `${year}-07-09`, ibgeCode: request.ibgeCode.slice(0, 2), scope: 'state' }),
  ])
}

describeDatabase('a busca no fornecedor (integration, spec 252 T3.3)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db
  const store = createDrizzleHolidayFetchStore(db)
  const companyId = crypto.randomUUID()

  beforeEach(async () => {
    await db.execute(sql`delete from holiday_import_cities`)
    await db.execute(sql`delete from holiday_provider_fetches where year between 2030 and 2040`)
    await db.execute(
      sql`delete from holiday_provider_entries where holiday_on between '2030-01-01' and '2040-12-31'`,
    )
    await db.execute(
      sql`delete from holiday_provider_monthly_usage where month between '2030-01-01' and '2040-12-31'`,
    )
    await db.execute(
      sql`insert into companies (id, status) values (${companyId}, 'active') on conflict (id) do nothing`,
    )
  })

  afterAll(async () => {
    await provider.close()
  })

  async function seedDemand(cities: ReadonlyArray<readonly [string, number]>) {
    for (const [cityCode, count] of cities) {
      await db.execute(sql`
        insert into holiday_import_cities (company_id, city_ibge_code, document_count)
        values (${companyId}, ${cityCode}, ${count})`)
    }
  }

  function build(input: {
    readonly budget?: number
    readonly now: Date
    readonly respond?: (request: HolidayProviderRequest) => HolidayProviderPage
  }) {
    const fake = buildFakeClock()
    const client = buildScriptedClient({
      clock: fake.clock,
      respond: input.respond ?? standardResponse,
    })
    const useCase = createFetchHolidayProviderUseCase({
      budget: input.budget ?? 5000,
      client,
      clock: fake.clock,
      logger: SILENT_LOGGER,
      now: () => input.now,
      store,
    })
    return { client, run: () => useCase.execute({ isStopRequested: () => false }) }
  }

  async function snapshot(): Promise<string> {
    const rows = await db.execute<{ dump: string }>(sql`
      select xmin::text || ':' || row_to_json(f)::text as dump from holiday_provider_fetches f
        where year between 2030 and 2040
      union all
      select xmin::text || ':' || row_to_json(e)::text from holiday_provider_entries e
        where holiday_on between '2030-01-01' and '2040-12-31'
      union all
      select xmin::text || ':' || row_to_json(u)::text from holiday_provider_monthly_usage u
        where month between '2030-01-01' and '2040-12-31'
      order by 1`)
    return [...rows].map((row) => row.dump).join('\n')
  }

  test('busca pela demanda decrescente, grava o cache pelas chaves do ADR e repetir o ciclo não escreve nada', async () => {
    const [cityA, cityB, cityC] = [randomCityCode(), randomCityCode(), randomCityCode()] as [
      string,
      string,
      string,
    ]
    await seedDemand([
      [cityA, 50],
      [cityB, 10],
      [cityC, 30],
    ])
    const now = new Date('2030-03-15T12:00:00.000Z')
    const { client, run } = build({ now })

    const first = await run()

    expect(
      client.requests
        .filter((request) => request.scope === 'city')
        .map((request) => `${request.ibgeCode}:${request.year}`),
    ).toEqual([
      `${cityA}:2030`,
      `${cityA}:2031`,
      `${cityC}:2030`,
      `${cityC}:2031`,
      `${cityB}:2030`,
      `${cityB}:2031`,
    ])
    expect(first.requests).toBe(8)

    const scopes = await db.execute<{ ibge_code: string; n: number; scope: string }>(sql`
      select scope, ibge_code, count(*)::int as n from holiday_provider_entries
      where holiday_on between '2030-01-01' and '2031-12-31'
      group by scope, ibge_code order by scope, ibge_code`)
    const rows = [...scopes].map((row) => [row.scope, row.ibge_code, Number(row.n)])
    // O estadual da resposta de cada cidade vira `state` + UF (uma data por ano), nunca o código da cidade.
    expect(rows).toEqual(
      [
        ['city', cityA, 4],
        ['city', cityB, 4],
        ['city', cityC, 4],
        ['national', 'BR', 4],
        ['state', '35', 2],
      ].toSorted((left, right) => `${left[0]}${left[1]}`.localeCompare(`${right[0]}${right[1]}`)),
    )
    const fetched = await db.execute<{
      n: number
      status: string
      next_attempt_at: Date
      fetched_at: Date
    }>(sql`
      select status, count(*)::int as n, min(next_attempt_at) as next_attempt_at, min(fetched_at) as fetched_at
      from holiday_provider_fetches where year between 2030 and 2031 group by status`)
    const [done] = [...fetched]
    expect(done?.status).toBe('done')
    expect(new Date(done?.next_attempt_at ?? 0).getTime()).toBe(now.getTime() + 180 * DAY_MS)
    const usage = await db.execute<{ month: string; requests: number }>(sql`
      select month::text as month, requests from holiday_provider_monthly_usage where month = '2030-03-01'`)
    expect([...usage].map((row) => [row.month, Number(row.requests)])).toEqual([['2030-03-01', 8]])

    const before = await snapshot()
    const second = await run()
    expect(second.requests).toBe(0)
    expect(await snapshot()).toBe(before)
  })

  test('o primeiro pedido do mês cria a linha do orçamento, e o teto nunca é ultrapassado', async () => {
    const month = '2033-05-01'
    expect(await store.claimBudget({ budget: 2, month })).toBeTrue()
    expect(await store.claimBudget({ budget: 2, month })).toBeTrue()
    expect(await store.claimBudget({ budget: 2, month })).toBeFalse()
    expect(await store.claimBudget({ budget: 2, month })).toBeFalse()

    const rows = await db.execute<{ requests: number }>(sql`
      select requests from holiday_provider_monthly_usage where month = ${month}`)
    expect([...rows].map((row) => Number(row.requests))).toEqual([2])
  })

  test('orçamento esgotado deixa os pares que sobraram `quota_exhausted` até o dia 1º do mês seguinte', async () => {
    const [cityA, cityB] = [randomCityCode(), randomCityCode()] as [string, string]
    await seedDemand([
      [cityA, 20],
      [cityB, 10],
    ])
    const { client, run } = build({ budget: 3, now: new Date('2032-03-15T12:00:00.000Z') })

    const tally = await run()

    expect(client.requests).toHaveLength(3)
    expect(tally.budgetExhausted).toBeTrue()
    const usage = await db.execute<{ requests: number }>(sql`
      select requests from holiday_provider_monthly_usage where month = '2032-03-01'`)
    expect([...usage].map((row) => Number(row.requests))).toEqual([3])
    const exhausted = await db.execute<{ next_attempt_at: Date; status: string }>(sql`
      select status, next_attempt_at from holiday_provider_fetches
      where status = 'quota_exhausted' and year between 2032 and 2033`)
    const rows = [...exhausted]
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(new Date(row.next_attempt_at).toISOString()).toBe('2032-04-01T03:00:00.000Z')
    }
  })

  test('falha do fornecedor grava o recuo no par, 404 vira `not_covered` e só os pares vencidos voltam', async () => {
    const [cityA, cityB, cityC] = [randomCityCode(), randomCityCode(), randomCityCode()] as [
      string,
      string,
      string,
    ]
    await seedDemand([
      [cityA, 30],
      [cityB, 20],
      [cityC, 10],
    ])
    const now = new Date('2034-03-15T12:00:00.000Z')
    const respond = (request: HolidayProviderRequest): HolidayProviderPage => {
      if (request.scope === 'city' && request.ibgeCode === cityA) {
        throw new HolidayProviderError({ code: HOLIDAY_PROVIDER_ERROR_CODE.UNREACHABLE })
      }
      if (request.scope === 'city' && request.ibgeCode === cityB) {
        throw new HolidayProviderError({ code: HOLIDAY_PROVIDER_ERROR_CODE.NOT_FOUND })
      }
      if (request.scope === 'city' && request.ibgeCode === cityC) {
        throw new HolidayProviderError({ code: HOLIDAY_PROVIDER_ERROR_CODE.MALFORMED_RESPONSE })
      }
      return standardResponse(request)
    }
    await build({ now, respond }).run()

    const readFetch = async (cityCode: string) => {
      const rows = await db.execute<{
        attempts: number
        last_error_code: string | null
        next_attempt_at: Date
        status: string
      }>(sql`
        select status, attempts, last_error_code, next_attempt_at from holiday_provider_fetches
        where scope = 'city' and ibge_code = ${cityCode} and year = 2034`)
      return [...rows][0]
    }
    const failed = await readFetch(cityA)
    expect([failed?.status, Number(failed?.attempts), failed?.last_error_code]).toEqual([
      'failed',
      1,
      'provider_unreachable',
    ])
    expect(new Date(failed?.next_attempt_at ?? 0).getTime()).toBe(now.getTime() + 3_600_000)
    const notCovered = await readFetch(cityB)
    expect(notCovered?.status).toBe('not_covered')
    expect(new Date(notCovered?.next_attempt_at ?? 0).getTime()).toBe(now.getTime() + 90 * DAY_MS)
    expect((await readFetch(cityC))?.last_error_code).toBe('malformed_response')

    // Duas horas depois só os `failed` vencem; o `not_covered` espera os 90 dias.
    const later = build({ now: new Date(now.getTime() + 2 * 3_600_000), respond })
    await later.run()
    const retried = new Set(
      later.client.requests
        .filter((request) => request.scope === 'city')
        .map((request) => request.ibgeCode),
    )
    expect([...retried].toSorted()).toEqual([cityA, cityC].toSorted())
    expect(Number((await readFetch(cityA))?.attempts)).toBe(2)
    expect(new Date((await readFetch(cityA))?.next_attempt_at ?? 0).getTime()).toBe(
      now.getTime() + 2 * 3_600_000 + 6 * 3_600_000,
    )
  })

  test('a data que o fornecedor deixa de listar ganha `removed_at`; se volta, o marcador sai; lista vazia não marca nada', async () => {
    const city = randomCityCode()
    await seedDemand([[city, 10]])
    const day = (month: string) => `2036-${month}`
    const withDates = (dates: readonly string[]) => (request: HolidayProviderRequest) =>
      request.scope === 'city' && request.year === 2036
        ? pageOf(dates.map((date) => entryOf({ date: day(date), ibgeCode: city, scope: 'city' })))
        : standardResponse(request)
    const readRemoved = async () => {
      const rows = await db.execute<{ holiday_on: string; removed: boolean }>(sql`
        select holiday_on::text as holiday_on, removed_at is not null as removed
        from holiday_provider_entries where scope = 'city' and ibge_code = ${city} and holiday_on between '2036-01-01' and '2036-12-31'
        order by holiday_on`)
      return [...rows].map((row) => [row.holiday_on, row.removed])
    }
    const now = new Date('2036-03-15T12:00:00.000Z')
    // O par da cidade volta a vencer sem esperar os 180 dias: o ano segue dentro do horizonte.
    const makeDue = () =>
      db.execute(sql`
        update holiday_provider_fetches set next_attempt_at = '2000-01-01T00:00:00Z'
        where scope = 'city' and ibge_code = ${city}`)

    await build({ now, respond: withDates(['05-01', '06-10', '09-07']) }).run()
    expect(await readRemoved()).toEqual([
      ['2036-05-01', false],
      ['2036-06-10', false],
      ['2036-09-07', false],
    ])

    await makeDue()
    await build({ now, respond: withDates(['05-01', '09-07']) }).run()
    expect(await readRemoved()).toEqual([
      ['2036-05-01', false],
      ['2036-06-10', true],
      ['2036-09-07', false],
    ])

    await makeDue()
    await build({ now, respond: withDates([]) }).run()
    expect(await readRemoved()).toEqual([
      ['2036-05-01', false],
      ['2036-06-10', true],
      ['2036-09-07', false],
    ])

    await makeDue()
    await build({ now, respond: withDates(['05-01', '06-10', '09-07']) }).run()
    expect(await readRemoved()).toEqual([
      ['2036-05-01', false],
      ['2036-06-10', false],
      ['2036-09-07', false],
    ])
  })

  test('demanda de empresa com a importação desligada não é buscada, e a de outra empresa sim', async () => {
    const [enabledCity, disabledCity] = [randomCityCode(), randomCityCode()] as [string, string]
    const disabledCompany = crypto.randomUUID()
    await db.execute(sql`insert into companies (id, status) values (${disabledCompany}, 'active')`)
    await db.execute(
      sql`insert into company_holiday_import_settings (company_id, is_enabled) values (${disabledCompany}, false)`,
    )
    await seedDemand([[enabledCity, 5]])
    await db.execute(sql`
      insert into holiday_import_cities (company_id, city_ibge_code, document_count)
      values (${disabledCompany}, ${disabledCity}, 99)`)
    const { client, run } = build({ now: new Date('2038-03-15T12:00:00.000Z') })

    await run()

    const cities = new Set(
      client.requests
        .filter((request) => request.scope === 'city')
        .map((request) => request.ibgeCode),
    )
    expect([...cities]).toEqual([enabledCity])
  })

  test('cidade sem o estadual na resposta pede o estado uma vez por ano e grava `state` + UF', async () => {
    const [cityA, cityB] = [randomCityCode(), randomCityCode()] as [string, string]
    await seedDemand([
      [cityA, 5],
      [cityB, 4],
    ])
    const { client, run } = build({
      now: new Date('2039-03-15T12:00:00.000Z'),
      respond: (request) =>
        request.scope === 'city'
          ? pageOf([
              entryOf({ date: `${request.year}-07-14`, ibgeCode: request.ibgeCode, scope: 'city' }),
            ])
          : standardResponse(request),
    })

    await run()

    expect(
      client.requests
        .filter((request) => request.scope === 'state')
        .map((request) => `${request.ibgeCode}:${request.year}`),
    ).toEqual(['35:2039', '35:2040'])
    const states = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from holiday_provider_entries
      where scope = 'state' and ibge_code = '35' and holiday_on between '2039-01-01' and '2040-12-31'`)
    expect(Number([...states][0]?.n)).toBe(2)
  })
})
