/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a contra Postgres (correção da revisão da Fase 4a, H1): o par roteiro ↔ carga por
 * votos vale só na leitura em que nasceu — nunca é gravado, e um par por votos gravado por uma versão
 * anterior não volta como par conhecido. Só o par pelos totais fica em `cargo_preview_route_loads`.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { afterAll, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'

import { createInProcessCargoPreviewWorkbookReader } from '../../src/cargo-preview/application/read-cargo-preview-workbook.service.js'
import { processCargoPreview } from '../../src/cargo-preview/application/process-cargo-preview.use-case.js'
import { DrizzleCargoPreviewWorkerRepository } from '../../src/cargo-preview/infrastructure/drizzle-cargo-preview-worker.repository.js'
import { CARGO_PREVIEW_EVENT_TYPE } from '../../src/messaging/cargo-preview-envelope.schema.js'
import { createCargoPreviewGraph } from '../fixtures/cargo-preview-graph.fixture.js'
import { buildCargoPreviewWorkbook } from '../fixtures/cargo-preview-workbook.fixture.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip
const ROUTE = 'FR.S.CAR'
const LOAD = '777'

const ROWS = [
  { RouteName: ROUTE, RoutingDate: 46297 },
  ...[
    { Company: '10001', PostalCode: '00000101', VALOR: 100, weight: 10 },
    { Company: '10002', VALOR: 30, weight: 3 },
    { Company: '10002', VALOR: 20, weight: 2 },
    { Company: '10003', VALOR: 70, weight: 7 },
  ].map(({ weight, ...row }, index) => ({
    ...row,
    'PESO TOTAL': weight,
    RouteName: ROUTE,
    RoutingDate: 46297,
    Text001: String(500_001 + index),
  })),
]

describeDatabase('o par roteiro ↔ carga no banco (integration, spec 237 H1)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db
  const repository = new DrizzleCargoPreviewWorkerRepository(db)

  afterAll(async () => {
    await provider.close()
  })

  async function readyPreview() {
    const graph = await createCargoPreviewGraph(db)
    const bytes = buildCargoPreviewWorkbook({ rows: ROWS })
    const previewId = await graph.seedPreview({
      bytes,
      receivedAt: new Date(Date.now() - 3_600_000),
    })
    await processCargoPreview(
      {
        companyId: graph.companyId,
        correlationId: 'integration',
        eventId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        payload: { bucket: 'b', contractorId: graph.contractorId, objectKey: 'k', previewId },
        type: CARGO_PREVIEW_EVENT_TYPE.PROCESS,
        version: 1,
      },
      {
        workbook: createInProcessCargoPreviewWorkbookReader({ clock: () => performance.now() }),
        now: () => new Date(),
        reader: { read: async () => bytes },
        repository,
      },
    )
    return { graph, previewId }
  }

  async function states(previewId: string): Promise<string[]> {
    const rows = await db.execute<{ match_state: string; row_number: number }>(
      sql`select row_number, match_state from cargo_preview_items where preview_id = ${previewId} order by row_number`,
    )
    return [...rows].map((row) => `${row.row_number}:${row.match_state}`)
  }

  async function routeLoads(previewId: string) {
    const rows = await db.execute<{ load_reference: string; origin: string; route_name: string }>(
      sql`select route_name, load_reference, origin from cargo_preview_route_loads where preview_id = ${previewId}`,
    )
    return [...rows]
  }

  test('o par por votos não é gravado; quando os totais fecham, o par pelos totais é', async () => {
    const { graph, previewId } = await readyPreview()
    const seed = (input: {
      number: string
      postalCode?: string
      value: string
      weightKg: string
    }) =>
      graph.seedDocument({
        ...input,
        loadReference: LOAD,
        recipientTaxId: `1111111100010${input.number}`,
      })
    await seed({ number: '1', postalCode: '00000101', value: '100.00', weightKg: '10.000' })
    await seed({ number: '2', value: '70.00', weightKg: '7.000' })

    await repository.reevaluate({ ...graph, now: new Date() })
    expect(await routeLoads(previewId)).toEqual([])
    expect(await states(previewId)).toEqual([
      '6:matched',
      '7:awaiting_xml',
      '8:awaiting_xml',
      '9:suggested',
    ])

    await seed({ number: '3', value: '50.00', weightKg: '5.000' })
    await repository.reevaluate({ ...graph, now: new Date() })
    expect(await routeLoads(previewId)).toEqual([
      { load_reference: LOAD, origin: 'totals', route_name: ROUTE },
    ])
    expect(await states(previewId)).toEqual(['6:matched', '7:matched', '8:matched', '9:matched'])
  })

  test('o par por votos gravado por uma versão anterior não volta como par conhecido', async () => {
    const { graph, previewId } = await readyPreview()
    await db.execute(sql`
      insert into cargo_preview_route_loads (company_id, preview_id, route_name, load_reference, origin)
      values (${graph.companyId}, ${previewId}, ${ROUTE}, '999', 'votes')`)
    await graph.seedDocument({
      loadReference: '999',
      number: '9',
      recipientTaxId: '99999999000199',
      value: '5.00',
      weightKg: '0.500',
    })
    await graph.seedDocument({
      loadReference: LOAD,
      number: '1',
      postalCode: '00000101',
      recipientTaxId: '11111111000101',
      value: '100.00',
      weightKg: '10.000',
    })

    await repository.reevaluate({ ...graph, now: new Date() })
    // Com o par antigo valendo, o roteiro só pegaria nota da carga 999 ou sem carga: 6 esperaria.
    expect((await states(previewId))[0]).toBe('6:matched')
  })
})
