/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T3.4 contra Postgres: a aplicação do cache do fornecedor no calendário da empresa. Prova o
 * SQL por conjunto — `ON CONFLICT DO NOTHING` (a digitada e a gerada por regra vencem), a supressão, só
 * datas de hoje em diante, o estadual `once` marcado e a trava de calendário por empresa. Cada teste
 * usa uma empresa nova e os anos de 2050 a 2060, que ele limpa antes (o cache é global).
 */
import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { createFetchHolidayProviderUseCase } from '../../src/holiday-provider-pull/application/fetch-holiday-provider.use-case.js'
import { createDrizzleHolidayFetchStore } from '../../src/holiday-provider-pull/infrastructure/drizzle-holiday-fetch.store.js'
import { buildFakeClock, buildScriptedClient } from '../fixtures/holiday-fetch.fixture.js'
import { createApplyHolidayProviderUseCase } from '../../src/holiday-provider-pull/application/apply-holiday-provider.use-case.js'
import { buildBusinessCalendarLockId } from '../../src/holiday-provider-pull/infrastructure/business-calendar-lock.support.js'
import { createDrizzleHolidayApplyStore } from '../../src/holiday-provider-pull/infrastructure/drizzle-holiday-apply.store.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const noop = () => undefined
const SILENT_LOGGER = { debug: noop, error: noop, info: noop, warn: noop } as never
const NOW = new Date('2050-03-15T12:00:00.000Z')
const TODAY = '2050-03-15'
const SAO_PAULO_CITY = '3509502'
const RIO_CITY = '3304557'
const OTHER_SAO_PAULO_CITY = '3548500'

describeDatabase('a aplicação dos feriados importados (integration, spec 252 T3.4)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db
  const store = createDrizzleHolidayApplyStore(db)
  const userId = crypto.randomUUID()

  beforeEach(async () => {
    await db.execute(
      sql`delete from holiday_import_suppressions where holiday_on between '2050-01-01' and '2060-12-31'`,
    )
    await db.execute(
      sql`delete from municipal_holidays where holiday_on between '2050-01-01' and '2060-12-31'`,
    )
    await db.execute(
      sql`delete from state_holidays where holiday_on between '2050-01-01' and '2060-12-31' or name = 'Anual digitado'`,
    )
    await db.execute(
      sql`delete from holiday_provider_entries where holiday_on between '2050-01-01' and '2060-12-31'`,
    )
    await db.execute(sql`delete from holiday_provider_fetches where year between 2050 and 2060`)
    await db.execute(
      sql`delete from holiday_provider_monthly_usage where month between '2050-01-01' and '2060-12-31'`,
    )
    await db.execute(sql`delete from holiday_import_cities`)
  })

  afterAll(async () => {
    await provider.close()
  })

  function apply() {
    return createApplyHolidayProviderUseCase({
      logger: SILENT_LOGGER,
      now: () => NOW,
      store,
    }).execute({
      isStopRequested: () => false,
    })
  }

  async function newCompany(
    cities: readonly string[],
    options: { readonly isEnabled?: boolean } = {},
  ) {
    const companyId = crypto.randomUUID()
    await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    if (options.isEnabled === false) {
      await db.execute(
        sql`insert into company_holiday_import_settings (company_id, is_enabled) values (${companyId}, false)`,
      )
    }
    for (const city of cities) {
      await db.execute(sql`
        insert into holiday_import_cities (company_id, city_ibge_code, document_count)
        values (${companyId}, ${city}, 1)`)
    }
    return companyId
  }

  async function newEntry(input: {
    readonly date: string
    readonly ibgeCode: string
    readonly name?: string
    readonly removed?: boolean
    readonly scope: 'city' | 'national' | 'state'
    readonly type: 'ESTADUAL' | 'FACULTATIVO' | 'MUNICIPAL' | 'NACIONAL'
  }): Promise<string> {
    const id = crypto.randomUUID()
    await db.execute(sql`
      insert into holiday_provider_entries (id, scope, ibge_code, holiday_on, name, provider_type, removed_at)
      values (${id}, ${input.scope}, ${input.ibgeCode}, ${input.date}, ${input.name ?? 'Feriado'}, ${input.type},
        ${input.removed === true ? sql`now()` : sql`null`})
      on conflict (scope, ibge_code, holiday_on) do update set name = excluded.name`)
    return id
  }

  async function municipalRows(companyId: string) {
    const rows = await db.execute<{
      city_ibge_code: string
      holiday_on: string
      kind: string
      name: string
      provider_entry_id: string | null
      source_rule_id: string | null
    }>(sql`
      select city_ibge_code, holiday_on::text as holiday_on, kind, name,
             provider_entry_id::text as provider_entry_id, source_rule_id::text as source_rule_id
      from municipal_holidays where company_id = ${companyId} order by holiday_on, city_ibge_code`)
    return [...rows]
  }

  async function stateRows(companyId: string) {
    const rows = await db.execute<{
      holiday_on: string | null
      name: string
      provider_entry_id: string | null
      recurrence: string
      state_ibge_code: string
    }>(sql`
      select state_ibge_code, recurrence, holiday_on::text as holiday_on, name,
             provider_entry_id::text as provider_entry_id
      from state_holidays where company_id = ${companyId} order by state_ibge_code, recurrence, holiday_on`)
    return [...rows]
  }

  async function snapshot(companyId: string): Promise<string> {
    const rows = await db.execute<{ dump: string }>(sql`
      select xmin::text || ':' || row_to_json(m)::text as dump from municipal_holidays m where company_id = ${companyId}
      union all
      select xmin::text || ':' || row_to_json(s)::text from state_holidays s where company_id = ${companyId}
      order by 1`)
    return [...rows].map((row) => row.dump).join('\n')
  }

  test('importa o municipal marcado com a entrada, com o nome do fornecedor, e repetir não escreve nada (CA4)', async () => {
    const companyId = await newCompany([SAO_PAULO_CITY])
    const entryId = await newEntry({
      date: '2050-07-14',
      ibgeCode: SAO_PAULO_CITY,
      name: 'Aniversário de Campinas',
      scope: 'city',
      type: 'MUNICIPAL',
    })

    const first = await apply()

    expect(await municipalRows(companyId)).toEqual([
      {
        city_ibge_code: SAO_PAULO_CITY,
        holiday_on: '2050-07-14',
        kind: 'holiday',
        name: 'Aniversário de Campinas',
        provider_entry_id: entryId,
        source_rule_id: null,
      },
    ])
    expect(first.municipalInserted).toBe(1)

    const before = await snapshot(companyId)
    const second = await apply()
    expect(second.municipalInserted).toBe(0)
    expect(second.stateInserted).toBe(0)
    expect(await snapshot(companyId)).toBe(before)
  })

  test('a data digitada e a gerada por regra no mesmo dia vencem a importada', async () => {
    const companyId = await newCompany([SAO_PAULO_CITY, OTHER_SAO_PAULO_CITY])
    await newEntry({
      date: '2050-07-14',
      ibgeCode: SAO_PAULO_CITY,
      name: 'Do fornecedor',
      scope: 'city',
      type: 'MUNICIPAL',
    })
    await newEntry({
      date: '2050-09-20',
      ibgeCode: OTHER_SAO_PAULO_CITY,
      name: 'Do fornecedor',
      scope: 'city',
      type: 'MUNICIPAL',
    })
    await db.execute(sql`
      insert into municipal_holidays (company_id, city_ibge_code, holiday_on, name)
      values (${companyId}, ${SAO_PAULO_CITY}, '2050-07-14', 'Digitada pelo operador')`)
    const ruleId = crypto.randomUUID()
    await db.execute(sql`
      insert into municipal_holiday_rules (id, company_id, city_ibge_code, month, day, kind, name, materialized_through_year)
      values (${ruleId}, ${companyId}, ${OTHER_SAO_PAULO_CITY}, 9, 20, 'city_anniversary', 'Gerada pela regra', 2051)`)
    await db.execute(sql`
      insert into municipal_holidays (company_id, city_ibge_code, holiday_on, name, kind, source_rule_id)
      values (${companyId}, ${OTHER_SAO_PAULO_CITY}, '2050-09-20', 'Gerada pela regra', 'city_anniversary', ${ruleId})`)

    const tally = await apply()

    const rows = await municipalRows(companyId)
    expect(rows.map((row) => [row.holiday_on, row.name, row.provider_entry_id])).toEqual([
      ['2050-07-14', 'Digitada pelo operador', null],
      ['2050-09-20', 'Gerada pela regra', null],
    ])
    expect(tally.municipalInserted).toBe(0)
  })

  test('a supressão do operador impede a volta, e ao ser apagada o feriado volta no ciclo seguinte (CA5)', async () => {
    const companyId = await newCompany([SAO_PAULO_CITY])
    const otherCompany = await newCompany([SAO_PAULO_CITY])
    await newEntry({
      date: '2050-07-14',
      ibgeCode: SAO_PAULO_CITY,
      scope: 'city',
      type: 'MUNICIPAL',
    })
    await db.execute(sql`
      insert into holiday_import_suppressions (company_id, scope, ibge_code, holiday_on, suppressed_by_user_id)
      values (${companyId}, 'city', ${SAO_PAULO_CITY}, '2050-07-14', ${userId})`)

    await apply()
    expect(await municipalRows(companyId)).toEqual([])
    // A supressão é da empresa que a fez: a outra recebe a data.
    expect((await municipalRows(otherCompany)).map((row) => row.holiday_on)).toEqual(['2050-07-14'])

    await db.execute(sql`delete from holiday_import_suppressions where company_id = ${companyId}`)
    await apply()
    expect((await municipalRows(companyId)).map((row) => row.holiday_on)).toEqual(['2050-07-14'])
  })

  test('só entram datas de hoje em diante (D7): ontem não, hoje sim', async () => {
    const companyId = await newCompany([SAO_PAULO_CITY])
    await newEntry({
      date: '2050-03-14',
      ibgeCode: SAO_PAULO_CITY,
      scope: 'city',
      type: 'MUNICIPAL',
    })
    await newEntry({ date: TODAY, ibgeCode: SAO_PAULO_CITY, scope: 'city', type: 'MUNICIPAL' })
    await newEntry({
      date: '2050-03-16',
      ibgeCode: SAO_PAULO_CITY,
      scope: 'city',
      type: 'MUNICIPAL',
    })

    await apply()

    expect((await municipalRows(companyId)).map((row) => row.holiday_on)).toEqual([
      '2050-03-15',
      '2050-03-16',
    ])
  })

  test('facultativo e nacional ficam só no cache, e a cidade de outra empresa não vaza (CA10)', async () => {
    const companyId = await newCompany([SAO_PAULO_CITY])
    await newEntry({
      date: '2050-12-20',
      ibgeCode: SAO_PAULO_CITY,
      scope: 'city',
      type: 'FACULTATIVO',
    })
    await newEntry({ date: '2050-12-25', ibgeCode: 'BR', scope: 'national', type: 'NACIONAL' })
    await newEntry({ date: '2050-07-14', ibgeCode: RIO_CITY, scope: 'city', type: 'MUNICIPAL' })

    await apply()

    expect(await municipalRows(companyId)).toEqual([])
    expect(await stateRows(companyId)).toEqual([])
  })

  test('data que o fornecedor removeu não entra, e a linha já importada fica (CA6)', async () => {
    const companyId = await newCompany([SAO_PAULO_CITY])
    const entryId = await newEntry({
      date: '2050-07-14',
      ibgeCode: SAO_PAULO_CITY,
      scope: 'city',
      type: 'MUNICIPAL',
    })
    await apply()
    expect(await municipalRows(companyId)).toHaveLength(1)

    await db.execute(
      sql`update holiday_provider_entries set removed_at = now() where id = ${entryId}`,
    )
    await newEntry({
      date: '2050-08-01',
      ibgeCode: SAO_PAULO_CITY,
      removed: true,
      scope: 'city',
      type: 'MUNICIPAL',
    })
    const tally = await apply()

    expect((await municipalRows(companyId)).map((row) => row.holiday_on)).toEqual(['2050-07-14'])
    expect(tally.municipalInserted).toBe(0)
  })

  test('empresa com a importação desligada não recebe nada; a outra recebe', async () => {
    const disabled = await newCompany([SAO_PAULO_CITY], { isEnabled: false })
    const enabled = await newCompany([SAO_PAULO_CITY])
    await newEntry({
      date: '2050-07-14',
      ibgeCode: SAO_PAULO_CITY,
      scope: 'city',
      type: 'MUNICIPAL',
    })
    await newEntry({ date: '2050-07-09', ibgeCode: '35', scope: 'state', type: 'ESTADUAL' })

    await apply()

    expect(await municipalRows(disabled)).toEqual([])
    expect(await stateRows(disabled)).toEqual([])
    expect(await municipalRows(enabled)).toHaveLength(1)
    expect(await stateRows(enabled)).toHaveLength(1)
  })

  test('o estadual vira `once` marcado só para a UF das cidades da empresa, e a digitada ou o anual digitado vencem (D6)', async () => {
    const saoPaulo = await newCompany([SAO_PAULO_CITY, OTHER_SAO_PAULO_CITY])
    const rio = await newCompany([RIO_CITY])
    const typed = await newCompany([SAO_PAULO_CITY])
    const yearly = await newCompany([SAO_PAULO_CITY])
    const entryId = await newEntry({
      date: '2050-07-09',
      ibgeCode: '35',
      name: 'Revolução',
      scope: 'state',
      type: 'ESTADUAL',
    })
    await newEntry({ date: '2050-10-28', ibgeCode: '35', scope: 'state', type: 'ESTADUAL' })
    await db.execute(sql`
      insert into state_holidays (company_id, state_ibge_code, recurrence, holiday_on, name)
      values (${typed}, '35', 'once', '2050-07-09', 'Digitado pelo operador')`)
    await db.execute(sql`
      insert into state_holidays (company_id, state_ibge_code, recurrence, month, day, name)
      values (${yearly}, '35', 'yearly', 10, 28, 'Anual digitado')`)

    await apply()

    expect(await stateRows(saoPaulo)).toEqual([
      {
        holiday_on: '2050-07-09',
        name: 'Revolução',
        provider_entry_id: entryId,
        recurrence: 'once',
        state_ibge_code: '35',
      },
      expect.objectContaining({ holiday_on: '2050-10-28', recurrence: 'once' }),
    ])
    expect(await stateRows(rio)).toEqual([])
    expect(
      (await stateRows(typed)).map((row) => [row.holiday_on, row.name, row.provider_entry_id]),
    ).toEqual([
      ['2050-07-09', 'Digitado pelo operador', null],
      ['2050-10-28', 'Feriado', expect.any(String)],
    ])
    // O anual digitado no mesmo dia e mês vence o `once` do dia 28/10; o de 09/07 entra.
    expect(
      (await stateRows(yearly)).map((row) => [row.recurrence, row.holiday_on, row.name]),
    ).toEqual([
      ['once', '2050-07-09', 'Revolução'],
      ['yearly', null, 'Anual digitado'],
    ])
  })

  test('a supressão do estado impede a volta, e a data passada do estado não entra', async () => {
    const companyId = await newCompany([SAO_PAULO_CITY])
    await newEntry({ date: '2050-07-09', ibgeCode: '35', scope: 'state', type: 'ESTADUAL' })
    await newEntry({ date: '2050-01-25', ibgeCode: '35', scope: 'state', type: 'ESTADUAL' })
    await db.execute(sql`
      insert into holiday_import_suppressions (company_id, scope, ibge_code, holiday_on, suppressed_by_user_id)
      values (${companyId}, 'state', '35', '2050-07-09', ${userId})`)

    await apply()

    expect(await stateRows(companyId)).toEqual([])
  })

  test('a paridade nacional lê só o `NACIONAL` vigente dos anos com busca concluída', async () => {
    await newEntry({ date: '2050-01-01', ibgeCode: 'BR', scope: 'national', type: 'NACIONAL' })
    await newEntry({ date: '2050-12-25', ibgeCode: 'BR', scope: 'national', type: 'NACIONAL' })
    await newEntry({
      date: '2050-04-05',
      ibgeCode: 'BR',
      removed: true,
      scope: 'national',
      type: 'NACIONAL',
    })
    await newEntry({ date: '2050-02-16', ibgeCode: 'BR', scope: 'national', type: 'FACULTATIVO' })
    await newEntry({ date: '2051-01-01', ibgeCode: 'BR', scope: 'national', type: 'NACIONAL' })
    await db.execute(sql`
      insert into holiday_provider_fetches (scope, ibge_code, year, status, next_attempt_at, fetched_at)
      values ('national', 'BR', 2050, 'done', now(), now()), ('national', 'BR', 2051, 'failed', now(), null)`)

    const dates = await store.readNationalDates({ years: [2050, 2051] })

    expect([...dates]).toEqual([[2050, ['2050-01-01', '2050-12-25']]])
  })

  test('restaurar a supressão reaplica do cache no ciclo seguinte, sem nova requisição ao fornecedor', async () => {
    const companyId = await newCompany([SAO_PAULO_CITY])
    const fake = buildFakeClock()
    const client = buildScriptedClient({
      clock: fake.clock,
      respond: (request) => ({
        entries:
          request.scope === 'city'
            ? [
                {
                  date: `${request.year}-07-14`,
                  externalId: null,
                  ibgeCode: request.ibgeCode,
                  isBanking: false,
                  name: 'Aniversário',
                  providerType: 'MUNICIPAL',
                  scope: 'city',
                },
                {
                  date: `${request.year}-07-09`,
                  externalId: null,
                  ibgeCode: '35',
                  isBanking: false,
                  name: 'Estadual',
                  providerType: 'ESTADUAL',
                  scope: 'state',
                },
              ]
            : [],
        receivedCount: 2,
      }),
    })
    const fetchStore = createDrizzleHolidayFetchStore(db)
    const cycle = async () => {
      const fetched = await createFetchHolidayProviderUseCase({
        budget: 1000,
        client,
        clock: fake.clock,
        logger: SILENT_LOGGER,
        now: () => NOW,
        store: fetchStore,
      }).execute({ isStopRequested: () => false })
      await apply()
      return fetched.requests
    }

    expect(await cycle()).toBeGreaterThan(0)
    expect((await municipalRows(companyId)).map((row) => row.holiday_on)).toEqual([
      '2050-07-14',
      '2051-07-14',
    ])
    const requestsAfterFirstCycle = client.requests.length

    // O que a API faz ao desligar: apaga a linha e grava a supressão. O ciclo seguinte não a traz de volta.
    await db.execute(
      sql`delete from municipal_holidays where company_id = ${companyId} and holiday_on = '2050-07-14'`,
    )
    await db.execute(sql`
      insert into holiday_import_suppressions (company_id, scope, ibge_code, holiday_on, suppressed_by_user_id)
      values (${companyId}, 'city', ${SAO_PAULO_CITY}, '2050-07-14', ${userId})`)
    expect(await cycle()).toBe(0)
    expect((await municipalRows(companyId)).map((row) => row.holiday_on)).toEqual(['2051-07-14'])

    // Restaurar só apaga a supressão (a API não lê o cache): quem reaplica é a rotina, do cache.
    await db.execute(sql`delete from holiday_import_suppressions where company_id = ${companyId}`)
    expect(await cycle()).toBe(0)
    expect((await municipalRows(companyId)).map((row) => row.holiday_on)).toEqual([
      '2050-07-14',
      '2051-07-14',
    ])
    expect(client.requests).toHaveLength(requestsAfterFirstCycle)
  })

  test('a aplicação espera a trava do calendário da empresa, a mesma que a API toma ao escrever', async () => {
    const companyId = await newCompany([SAO_PAULO_CITY])
    await newEntry({
      date: '2050-07-14',
      ibgeCode: SAO_PAULO_CITY,
      scope: 'city',
      type: 'MUNICIPAL',
    })
    const lockId = await buildBusinessCalendarLockId(companyId)
    let pending: Promise<unknown> | undefined

    const outcome = await db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(${lockId})`)
      pending = store.applyCompany({ companyId, today: TODAY })
      return Promise.race([
        pending.then(() => 'finished'),
        new Promise<string>((resolve) => setTimeout(() => resolve('blocked'), 400)),
      ])
    })

    expect(outcome).toBe('blocked')
    await pending
    expect(await municipalRows(companyId)).toHaveLength(1)
  })
})
