/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T4.2 (CA7, CA8) contra Postgres: o REGISTRO de verdade, o banco de verdade e um fornecedor falso.
 * Prova que a rotina está registrada sem nenhuma variável, que sem linha nada sai e a descoberta e a aplicação
 * rodam, que a busca usa a chave e o orçamento DO BANCO (o `Authorization` do fornecedor falso confere), que
 * trocar a chave entre dois ciclos vale no segundo e que envelope ilegível fecha `credential_unreadable`.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { createJobCycle } from '../../src/job-run/application/run-job-cycle.js'
import type { JobExecutionPort } from '../../src/job-run/application/job-execution.port.js'
import { resolveBudgetMonth } from '../../src/holiday-provider-pull/domain/holiday-provider-schedule.policy.js'
import { buildHolidayProviderPullRegistry } from '../../src/holiday-provider-pull/infrastructure/holiday-provider-pull.registry.js'
import { jsonResponse } from '../fixtures/feriados-api.fixture.js'
import { buildFakeClock } from '../fixtures/holiday-fetch.fixture.js'
import { createHolidayNfeGraph } from '../fixtures/holiday-nfe-graph.fixture.js'
import {
  insertProviderSettings,
  replaceProviderEnvelope,
} from '../fixtures/holiday-provider-settings-row.fixture.js'
import {
  FIXTURE_HOLIDAY_TOKEN,
  FOREIGN_PROVIDER,
  INSTALLATION_PROVIDER,
  sealLikeTheApiWould,
} from '../fixtures/holiday-provider-token-seal.fixture.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const CITY = '3509502'
const ENTRY_DATE = '2070-07-14'
const RENEWED_TOKEN = 'FAKE-renewed-key-Q7zK-9876543210'

describeDatabase('a rotina com a chave e o orçamento do banco (integration, spec 262 T4.2)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db
  const month = resolveBudgetMonth(new Date())

  /**
   * A aplicação lê o cache GLOBAL: o que outros testes deixaram nele seria aplicado às empresas deste e travaria
   * a limpeza deles por FK. Por isso a limpeza é do que a rotina deriva do cache, antes e depois de cada teste.
   */
  async function cleanProviderState() {
    await db.execute(sql`delete from holiday_provider_settings`)
    await db.execute(sql`delete from holiday_import_cities`)
    await db.execute(sql`delete from holiday_provider_fetches`)
    await db.execute(sql`delete from holiday_provider_monthly_usage`)
    await db.execute(sql`delete from municipal_holidays where provider_entry_id is not null`)
    await db.execute(sql`delete from state_holidays where provider_entry_id is not null`)
    await db.execute(sql`delete from holiday_provider_entries`)
  }

  beforeEach(cleanProviderState)

  afterEach(cleanProviderState)

  afterAll(async () => {
    await provider.close()
  })

  /** Um ciclo inteiro pelo invólucro: registro → rotina → desfecho gravado. */
  async function runCycle() {
    const requests: Array<{ readonly authorization: string | null; readonly url: string }> = []
    const logged: unknown[][] = []
    const record = (...args: unknown[]) => {
      logged.push(args)
    }
    const finished: Array<{ counters: Readonly<Record<string, number>>; outcome: string }> = []
    const executions: JobExecutionPort = {
      claim: async () => ({ job: 'holiday.provider.pull', origin: 'schedule' }),
      finish: async (params) => {
        finished.push({ counters: params.counters, outcome: params.outcome })
      },
      renew: async () => ({ cancelRequestedAt: undefined }),
    }
    const logger = { debug: record, error: record, info: record, warn: record } as never
    const cycle = createJobCycle({
      executions,
      logger,
      now: () => new Date(),
      routines: buildHolidayProviderPullRegistry({
        clock: buildFakeClock().clock,
        database: db,
        envelopeProvider: INSTALLATION_PROVIDER,
        fetch: async (url, init) => {
          const headers = new Headers(init.headers)
          requests.push({ authorization: headers.get('authorization'), url })
          return jsonResponse([])
        },
        logger,
      }),
    })

    await cycle.run({
      envelope: { correlationId: 'access', payload: { executionId: crypto.randomUUID() } } as never,
    })

    return { everything: JSON.stringify({ finished, logged }), finished, logged, requests }
  }

  async function seedKey(input: { readonly budget?: number; readonly token?: string }) {
    const settingsId = crypto.randomUUID()
    const envelope = await sealLikeTheApiWould({
      settingsId,
      ...(input.token === undefined ? {} : { token: input.token }),
    })
    await insertProviderSettings(db, {
      envelope,
      settingsId,
      ...(input.budget === undefined ? {} : { budget: input.budget }),
    })
    return { envelope, settingsId }
  }

  async function seedDemand() {
    const graph = await createHolidayNfeGraph(db)
    await graph.seedDocument({ participants: [{ cityCode: CITY, role: 'delivery' }] })
    return graph.companyId
  }

  async function setMonthlyUsage(requests: number) {
    await db.execute(sql`
      insert into holiday_provider_monthly_usage (month, requests) values (${month}::date, ${requests})
      on conflict (month) do update set requests = excluded.requests`)
  }

  test('sem linha: 0 requisições, `token_missing = 1`, `succeeded`; a descoberta e a aplicação rodaram', async () => {
    const companyId = await seedDemand()
    await db.execute(sql`
      insert into holiday_provider_entries (scope, ibge_code, holiday_on, name, provider_type)
      values ('city', ${CITY}, ${ENTRY_DATE}, 'Aniversário', 'MUNICIPAL')`)

    const { finished, logged, requests } = await runCycle()

    expect(requests).toEqual([])
    expect(finished).toHaveLength(1)
    expect(finished[0]?.outcome).toBe('succeeded')
    expect(finished[0]?.counters).toMatchObject({ requests: 0, token_missing: 1 })
    expect(finished[0]?.counters.discovery_documents).toBeGreaterThanOrEqual(1)
    expect(JSON.stringify(logged)).not.toContain('job_run_routine_missing')
    const inserted = await db.execute<{ holiday_on: string }>(sql`
      select holiday_on::text as holiday_on from municipal_holidays
      where company_id = ${companyId} and city_ibge_code = ${CITY}`)
    expect([...inserted].map((row) => row.holiday_on)).toEqual([ENTRY_DATE])
  })

  test('linha com orçamento e sem chave: o mesmo, nenhuma requisição', async () => {
    await seedDemand()
    await insertProviderSettings(db, { budget: 2500, settingsId: crypto.randomUUID() })

    const { finished, requests } = await runCycle()

    expect(requests).toEqual([])
    expect(finished[0]).toMatchObject({ outcome: 'succeeded' })
    expect(finished[0]?.counters).toMatchObject({ requests: 0, token_missing: 1 })
  })

  test('com chave: o `Authorization` do fornecedor é o da chave do banco, sem a chave em log nem contador', async () => {
    await seedDemand()
    await seedKey({ budget: 1 })

    const { everything, finished, requests } = await runCycle()

    expect(requests).toHaveLength(1)
    expect(requests[0]?.authorization).toBe(`Bearer ${FIXTURE_HOLIDAY_TOKEN}`)
    expect(finished[0]?.counters).toMatchObject({ budget_exhausted: 1, requests: 1 })
    expect(finished[0]?.counters).not.toHaveProperty('token_missing')
    expect(everything).not.toContain(FIXTURE_HOLIDAY_TOKEN)
  })

  test('o orçamento definido no banco vale: com 300 e 299 usados, só uma requisição sai', async () => {
    await seedDemand()
    await seedKey({ budget: 300 })
    await setMonthlyUsage(299)

    const { finished, requests } = await runCycle()

    expect(requests).toHaveLength(1)
    expect(finished[0]?.counters).toMatchObject({ budget_exhausted: 1, requests: 1 })
  })

  test('o orçamento definido no banco vale ABAIXO do padrão: com 300 e 4499 usados, nenhuma requisição', async () => {
    await seedDemand()
    await seedKey({ budget: 300 })
    await setMonthlyUsage(4499)

    const { finished, requests } = await runCycle()

    expect(requests).toEqual([])
    expect(finished[0]?.counters).toMatchObject({ budget_exhausted: 1, requests: 0 })
  })

  test('orçamento NULL é o padrão de 4.500: com 4499 usados sai uma requisição, com 4500 nenhuma', async () => {
    await seedDemand()
    await seedKey({})
    await setMonthlyUsage(4499)

    const lastOne = await runCycle()
    await setMonthlyUsage(4500)
    await db.execute(sql`delete from holiday_provider_fetches`)
    const none = await runCycle()

    expect(lastOne.requests).toHaveLength(1)
    expect(none.requests).toEqual([])
    expect(none.finished[0]?.counters).toMatchObject({ budget_exhausted: 1 })
  })

  test('trocar a chave entre dois ciclos: o segundo usa a nova', async () => {
    await seedDemand()
    const { settingsId } = await seedKey({ budget: 1 })

    const first = await runCycle()
    await replaceProviderEnvelope(
      db,
      await sealLikeTheApiWould({ settingsId, token: RENEWED_TOKEN }),
    )
    await setMonthlyUsage(0)
    const second = await runCycle()

    expect(first.requests.map((request) => request.authorization)).toEqual([
      `Bearer ${FIXTURE_HOLIDAY_TOKEN}`,
    ])
    expect(second.requests.map((request) => request.authorization)).toEqual([
      `Bearer ${RENEWED_TOKEN}`,
    ])
    expect(`${first.everything}${second.everything}`).not.toContain(RENEWED_TOKEN)
  })

  test('envelope que não abre (chaveiro de outra instalação): 0 requisições, `credential_unreadable`', async () => {
    await seedDemand()
    const settingsId = crypto.randomUUID()
    const envelope = await sealLikeTheApiWould({ provider: FOREIGN_PROVIDER, settingsId })
    await insertProviderSettings(db, { envelope, settingsId })

    const { everything, finished, requests } = await runCycle()

    expect(requests).toEqual([])
    expect(finished[0]?.outcome).toBe('credential_unreadable')
    expect(finished[0]?.counters).toMatchObject({ requests: 0, token_unreadable: 1 })
    expect(everything).not.toContain(envelope.ciphertext)
    expect(everything).not.toContain(FIXTURE_HOLIDAY_TOKEN)
  })

  test('envelope selado para o id de outra linha também não abre', async () => {
    await seedDemand()
    const envelope = await sealLikeTheApiWould({ settingsId: crypto.randomUUID() })
    await insertProviderSettings(db, { envelope, settingsId: crypto.randomUUID() })

    const { finished, requests } = await runCycle()

    expect(requests).toEqual([])
    expect(finished[0]?.outcome).toBe('credential_unreadable')
  })
})
