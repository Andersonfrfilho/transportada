/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T3.2 contra Postgres: a descoberta das cidades de destino pelo cursor de
 * `nfe_documents_company_updated_issued_id_idx`, com a mesma junção do roteirizador. O lote venenoso
 * (código de cidade lixo) não pode derrubar o upsert pela CHECK `holiday_import_cities_city_check`.
 * Cada teste usa uma empresa nova; as demais empresas do banco também entram no ciclo, e ninguém olha
 * para elas.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { createDiscoverHolidayCitiesUseCase } from '../../src/holiday-provider-pull/application/discover-holiday-cities.use-case.js'
import { buildDocumentBatchQuery } from '../../src/holiday-provider-pull/infrastructure/holiday-discovery.query.js'
import { createDrizzleHolidayDiscoveryStore } from '../../src/holiday-provider-pull/infrastructure/drizzle-holiday-discovery.store.js'
import { createHolidayNfeGraph } from '../fixtures/holiday-nfe-graph.fixture.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const NOW = new Date('2026-10-09T12:00:00.000Z')
const noop = () => undefined
const SILENT_LOGGER = { debug: noop, error: noop, info: noop, warn: noop } as never

describeDatabase('a descoberta das cidades de destino (integration, spec 252 T3.2)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db
  const store = createDrizzleHolidayDiscoveryStore(db)

  afterAll(async () => {
    await provider.close()
  })

  function discover(input: { readonly batchSize?: number } = {}) {
    return createDiscoverHolidayCitiesUseCase({
      batchSize: input.batchSize ?? 2000,
      logger: SILENT_LOGGER,
      maxBatches: 20,
      now: () => NOW,
      store,
    }).execute({ isStopRequested: () => false })
  }

  async function readCities(companyId: string): Promise<Array<[string, number]>> {
    const rows = await db.execute<{ city_ibge_code: string; document_count: number }>(sql`
      select city_ibge_code, document_count from holiday_import_cities
      where company_id = ${companyId} order by city_ibge_code`)
    return [...rows].map((row) => [row.city_ibge_code, Number(row.document_count)])
  }

  async function readCursor(companyId: string) {
    const rows = await db.execute<{ cursor_document_id: string | null; is_enabled: boolean }>(sql`
      select cursor_document_id::text as cursor_document_id, is_enabled
      from company_holiday_import_settings where company_id = ${companyId}`)
    return [...rows][0]
  }

  test('conta uma nota por cidade de destino, com a entrega vencendo o destinatário', async () => {
    const graph = await createHolidayNfeGraph(db)
    await graph.seedDocument({
      participants: [{ cityCode: '3509502', role: 'recipient' }],
    })
    await graph.seedDocument({
      participants: [
        { cityCode: '3550308', role: 'recipient' },
        { cityCode: '3509502', role: 'delivery' },
      ],
    })
    // Entrega sem CEP utilizável: cai para o destinatário, como no roteirizador.
    await graph.seedDocument({
      participants: [
        { cityCode: '3304557', role: 'recipient' },
        { cityCode: '3509502', postalCode: null, role: 'delivery' },
      ],
    })

    const tally = await discover()

    expect(await readCities(graph.companyId)).toEqual([
      ['3304557', 1],
      ['3509502', 2],
    ])
    expect(tally.batches).toBeGreaterThanOrEqual(1)
    expect((await readCursor(graph.companyId))?.cursor_document_id).not.toBeNull()
  })

  test('lote venenoso: os códigos lixo saem em TypeScript, só os válidos entram e o cursor anda', async () => {
    const graph = await createHolidayNfeGraph(db)
    for (const cityCode of ['3509502', null, '', '9999999', '3909502', '3509502', '3550308']) {
      await graph.seedDocument({ participants: [{ cityCode, role: 'recipient' }] })
    }

    const tally = await discover()

    expect(await readCities(graph.companyId)).toEqual([
      ['3509502', 2],
      ['3550308', 1],
    ])
    expect(tally.discardedCityCodes).toBeGreaterThanOrEqual(4)
    const cursor = await readCursor(graph.companyId)
    expect(cursor?.cursor_document_id).not.toBeNull()

    // Nada novo: o segundo ciclo não relê nem reconta.
    await discover()
    expect(await readCities(graph.companyId)).toEqual([
      ['3509502', 2],
      ['3550308', 1],
    ])
  })

  test('empresa com a importação desligada é pulada, e a de outra empresa não vaza', async () => {
    const disabled = await createHolidayNfeGraph(db)
    const other = await createHolidayNfeGraph(db)
    await db.execute(sql`
      insert into company_holiday_import_settings (company_id, is_enabled)
      values (${disabled.companyId}, false)`)
    await disabled.seedDocument({ participants: [{ cityCode: '3509502', role: 'recipient' }] })
    await other.seedDocument({ participants: [{ cityCode: '3550308', role: 'recipient' }] })

    await discover()

    expect(await readCities(disabled.companyId)).toEqual([])
    expect((await readCursor(disabled.companyId))?.cursor_document_id).toBeNull()
    expect(await readCities(other.companyId)).toEqual([['3550308', 1]])
  })

  test('empresa suspensa não entra', async () => {
    const graph = await createHolidayNfeGraph(db)
    await graph.seedDocument({ participants: [{ cityCode: '3509502', role: 'recipient' }] })
    await db.execute(sql`update companies set status = 'disabled' where id = ${graph.companyId}`)

    await discover()

    expect(await readCities(graph.companyId)).toEqual([])
  })

  test('o cursor anda por vários lotes sem pular nem recontar, mesmo com microssegundos', async () => {
    const graph = await createHolidayNfeGraph(db)
    // Duas notas separadas por microssegundos: no `Date` do JavaScript elas são o mesmo instante.
    await graph.seedDocument({
      participants: [{ cityCode: '3509502', role: 'recipient' }],
      updatedAt: '2026-09-01 10:00:00.000100+00',
    })
    await graph.seedDocument({
      participants: [{ cityCode: '3509502', role: 'recipient' }],
      updatedAt: '2026-09-01 10:00:00.000900+00',
    })
    for (let index = 0; index < 5; index += 1) {
      await graph.seedDocument({
        participants: [{ cityCode: '3550308', role: 'recipient' }],
        updatedAt: `2026-09-02 10:00:0${index}.500000+00`,
      })
    }

    await discover({ batchSize: 1 })
    expect(await readCities(graph.companyId)).toEqual([
      ['3509502', 2],
      ['3550308', 5],
    ])

    await graph.seedDocument({
      participants: [{ cityCode: '3550308', role: 'recipient' }],
      updatedAt: '2026-09-03 10:00:00.000000+00',
    })
    await discover({ batchSize: 3 })
    expect(await readCities(graph.companyId)).toEqual([
      ['3509502', 2],
      ['3550308', 6],
    ])
  })

  test('o lote de notas usa o índice do cursor e a junção não deixa a consulta sem plano', async () => {
    const graph = await createHolidayNfeGraph(db)
    await graph.seedBulkDocuments({ cityCode: '3509502', count: 2100, prefix: '9100' })

    const plan = await db.execute<{ 'QUERY PLAN': string }>(
      sql`explain (analyze, buffers) ${buildDocumentBatchQuery({
        companyId: graph.companyId,
        cursor: undefined,
        limit: 2000,
      })}`,
    )
    const text = [...plan].map((row) => row['QUERY PLAN']).join('\n')

    expect(text).toContain('nfe_documents_company_updated_issued_id_idx')
  })
})
