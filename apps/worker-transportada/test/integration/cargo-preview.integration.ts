/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.3 contra Postgres: a leitura grava os itens e é idempotente; a reavaliação vincula
 * quando o XML chega — só notas do emitente do contratante, da empresa e da janela —, aprende o
 * alias só do que vinculou, nunca mexe no que o operador decidiu, e duas reavaliações simultâneas
 * não duplicam vínculo.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { afterAll, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'

import { createThreadedCargoPreviewWorkbookReader } from '../../src/cargo-preview/infrastructure/threaded-cargo-preview-workbook.gateway.js'
import type { CargoPreviewProcessEnvelope } from '../../src/messaging/cargo-preview-envelope.schema.js'
import { CARGO_PREVIEW_EVENT_TYPE } from '../../src/messaging/cargo-preview-envelope.schema.js'
import { processCargoPreview } from '../../src/cargo-preview/application/process-cargo-preview.use-case.js'
import { learnRecipientAliases } from '../../src/cargo-preview/infrastructure/cargo-preview-alias.writer.js'
import { DrizzleCargoPreviewWorkerRepository } from '../../src/cargo-preview/infrastructure/drizzle-cargo-preview-worker.repository.js'
import { buildCargoPreviewWorkbook } from '../fixtures/cargo-preview-workbook.fixture.js'
import {
  createCargoPreviewGraph,
  type CargoPreviewGraph,
} from '../fixtures/cargo-preview-graph.fixture.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

const ROWS = [
  { RouteName: 'FR.S.CAR', RoutingDate: 46297 },
  {
    Company: '10001',
    CompanyName: 'Destinatario Um',
    'PESO TOTAL': 10,
    PostalCode: '00000101',
    RouteName: 'FR.S.CAR',
    RoutingDate: 46297,
    Text001: '500001',
    VALOR: 100,
  },
  {
    Company: '10002',
    'PESO TOTAL': 3,
    RouteName: 'FR.S.CAR',
    RoutingDate: 46297,
    Text001: '500002',
    VALOR: 30,
  },
  {
    Company: '10002',
    'PESO TOTAL': 2,
    RouteName: 'FR.S.CAR',
    RoutingDate: 46297,
    Text001: '500003',
    VALOR: 20,
  },
  {
    Company: '10003',
    'PESO TOTAL': 7,
    RouteName: 'FR.S.CAR',
    RoutingDate: 46297,
    Text001: '500004',
    VALOR: 70,
  },
  { Company: '10004', 'PESO TOTAL': 'x', RouteName: 'FR.S.CAR', RoutingDate: 46297, VALOR: 9 },
]

describeDatabase('a prévia no worker (integration, spec 237 T4.3)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db
  const repository = new DrizzleCargoPreviewWorkerRepository(db)

  afterAll(async () => {
    await provider.close()
  })

  function envelopeOf(graph: CargoPreviewGraph, previewId: string): CargoPreviewProcessEnvelope {
    return {
      companyId: graph.companyId,
      correlationId: 'integration',
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      payload: { bucket: 'b', contractorId: graph.contractorId, objectKey: 'k', previewId },
      type: CARGO_PREVIEW_EVENT_TYPE.PROCESS,
      version: 1,
    }
  }

  async function process(graph: CargoPreviewGraph, bytes: Uint8Array, previewId: string) {
    return processCargoPreview(envelopeOf(graph, previewId), {
      workbook: createThreadedCargoPreviewWorkbookReader(),
      now: () => new Date(),
      reader: { read: async () => bytes },
      repository,
    })
  }

  async function states(previewId: string): Promise<string[]> {
    const rows = await db.execute<{
      match_state: string
      matched_by: string | null
      row_number: number
    }>(
      sql`select row_number, match_state, matched_by from cargo_preview_items where preview_id = ${previewId} order by row_number`,
    )
    return [...rows].map((row) => `${row.row_number}:${row.match_state}:${row.matched_by ?? '-'}`)
  }

  async function count(table: string, companyId: string): Promise<number> {
    const rows = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from ${sql.identifier(table)} where company_id = ${companyId}`,
    )
    return [...rows][0]?.total ?? 0
  }

  async function readyGraph() {
    const graph = await createCargoPreviewGraph(db)
    const bytes = buildCargoPreviewWorkbook({ rows: ROWS })
    const previewId = await graph.seedPreview({ bytes, receivedAt: new Date(Date.now() - HOUR_MS) })
    return { bytes, graph, previewId }
  }

  test('lê a planilha: tudo espera o XML, a linha ruim é invalid, e reprocessar não duplica', async () => {
    const { bytes, graph, previewId } = await readyGraph()
    expect(await process(graph, bytes, previewId)).toBe('ready')
    expect(await states(previewId)).toEqual([
      '6:awaiting_xml:-',
      '7:awaiting_xml:-',
      '8:awaiting_xml:-',
      '9:awaiting_xml:-',
      '10:invalid:-',
    ])
    const [preview] = [
      ...(await db.execute<{ planned_date: string; row_count: number; status: string }>(
        sql`select status, row_count, planned_date::text from cargo_previews where id = ${previewId}`,
      )),
    ]
    expect(preview).toEqual({ planned_date: '2026-10-02', row_count: 5, status: 'ready' })

    expect(await process(graph, bytes, previewId)).toBe('already_done')
    expect(await count('cargo_preview_items', graph.companyId)).toBe(5)
    expect(await count('cargo_preview_events', graph.companyId)).toBe(1)
  })

  test('arquivo que não é planilha: failed com o código, nenhum item', async () => {
    const graph = await createCargoPreviewGraph(db)
    const bytes = new TextEncoder().encode('PK\u0003\u0004 truncado')
    const previewId = await graph.seedPreview({ bytes, receivedAt: new Date() })
    expect(await process(graph, bytes, previewId)).toBe('failed')
    const [row] = [
      ...(await db.execute<{ error_code: string; status: string }>(
        sql`select status, error_code from cargo_previews where id = ${previewId}`,
      )),
    ]
    expect(row).toEqual({ error_code: 'PREVIEW_NOT_A_WORKBOOK', status: 'failed' })
    expect(await count('cargo_preview_items', graph.companyId)).toBe(0)
  })

  test('o XML que chega vincula; nota de outro emitente, outra empresa ou fora da janela, não', async () => {
    const { bytes, graph, previewId } = await readyGraph()
    await process(graph, bytes, previewId)
    const other = await createCargoPreviewGraph(db)
    await other.seedDocument({
      number: '9',
      recipientTaxId: '33333333000103',
      value: '70.00',
      weightKg: '7.000',
    })
    await graph.seedDocument({
      emitterTaxId: '11222333000181',
      number: '8',
      recipientTaxId: '33333333000103',
      value: '70.00',
      weightKg: '7.000',
    })
    await graph.seedDocument({
      createdAt: new Date(Date.now() - 40 * DAY_MS),
      number: '7',
      recipientTaxId: '33333333000103',
      value: '70.00',
      weightKg: '7.000',
    })
    const first = await graph.seedDocument({
      loadReference: '777',
      number: '1',
      postalCode: '00000101',
      recipientTaxId: '11111111000101',
      value: '100.00',
      weightKg: '10.000',
    })
    const second = await graph.seedDocument({
      loadReference: '777',
      number: '2',
      recipientTaxId: '22222222000102',
      value: '50.00',
      weightKg: '5.000',
    })

    const outcome = await repository.reevaluate({ ...graph, now: new Date() })
    expect(outcome.changedItems).toBe(3)
    // 10002 fecha só valor e peso, sem CEP nem par por totais: sugestão, e não ensina alias (M2).
    expect(await states(previewId)).toEqual([
      '6:matched:system',
      '7:suggested:system',
      '8:suggested:system',
      '9:awaiting_xml:-',
      '10:invalid:-',
    ])
    const links = await db.execute<{ document_id: string }>(
      sql`select document_id from cargo_preview_document_links where preview_id = ${previewId} order by document_id`,
    )
    expect([...links].map((row) => row.document_id)).toEqual([first])
    expect(second).toBeString()
    expect(await count('cargo_preview_route_loads', graph.companyId)).toBe(0)
    const aliases = await db.execute<{ recipient_code: string; recipient_tax_id: string }>(
      sql`select recipient_code, recipient_tax_id from contractor_recipient_aliases where company_id = ${graph.companyId} order by recipient_code`,
    )
    expect([...aliases]).toEqual([{ recipient_code: '10001', recipient_tax_id: '11111111000101' }])

    const events = await count('cargo_preview_events', graph.companyId)
    expect((await repository.reevaluate({ ...graph, now: new Date() })).changedItems).toBe(0)
    expect(await count('cargo_preview_events', graph.companyId)).toBe(events)
  })

  /** Revisão de segurança S6: vínculo reforçado que contradiz o alias o invalida (nunca o troca). */
  test('o que o operador decidiu a máquina não toca, e alias em conflito é invalidado', async () => {
    const { bytes, graph, previewId } = await readyGraph()
    await process(graph, bytes, previewId)
    await db.execute(sql`
      update cargo_preview_items set matched_by = 'user', matched_at = now(),
        matched_by_user_id = (select uploaded_by_user_id from cargo_previews where id = ${previewId})
      where preview_id = ${previewId} and row_number = 7`)
    await db.execute(sql`
      insert into contractor_recipient_aliases (company_id, contractor_id, recipient_code, recipient_tax_id, learned_from_preview_id)
      values (${graph.companyId}, ${graph.contractorId}, '10001', '99999999000199', ${previewId})`)
    await graph.seedDocument({
      number: '1',
      postalCode: '00000101',
      recipientTaxId: '11111111000101',
      value: '100.00',
      weightKg: '10.000',
    })
    await graph.seedDocument({
      number: '2',
      recipientTaxId: '22222222000102',
      value: '50.00',
      weightKg: '5.000',
    })

    const outcome = await repository.reevaluate({ ...graph, now: new Date() })
    expect(outcome.aliasConflicts).toBe(1)
    const current = await states(previewId)
    expect(current[1]).toBe('7:awaiting_xml:user')
    const aliases = await db.execute<{ recipient_tax_id: string }>(
      sql`select recipient_tax_id from contractor_recipient_aliases where company_id = ${graph.companyId} and recipient_code = '10001'`,
    )
    expect([...aliases]).toEqual([])
  })

  test('duas reavaliações ao mesmo tempo não ligam a mesma nota duas vezes', async () => {
    const { bytes, graph, previewId } = await readyGraph()
    await process(graph, bytes, previewId)
    const secondPreview = await graph.seedPreview({
      bytes: buildCargoPreviewWorkbook({ rows: ROWS.slice(0, 2), reservedEmptyRows: 3 }),
      receivedAt: new Date(Date.now() - 2 * HOUR_MS),
    })
    await process(
      graph,
      buildCargoPreviewWorkbook({ rows: ROWS.slice(0, 2), reservedEmptyRows: 3 }),
      secondPreview,
    )
    await graph.seedDocument({
      number: '1',
      postalCode: '00000101',
      recipientTaxId: '11111111000101',
      value: '100.00',
      weightKg: '10.000',
    })

    const outcomes = await Promise.all([
      repository.reevaluate({ ...graph, now: new Date() }),
      repository.reevaluate({ ...graph, now: new Date() }),
    ])
    expect(outcomes.map((outcome) => outcome.changedItems).sort()).toEqual([0, 1])
    expect(await count('cargo_preview_document_links', graph.companyId)).toBe(1)
    const [link] = [
      ...(await db.execute<{ preview_id: string }>(
        sql`select preview_id from cargo_preview_document_links where company_id = ${graph.companyId}`,
      )),
    ]
    // A prévia mais antiga vence a disputa, em qualquer ordem de chegada das reavaliações.
    expect(link?.preview_id).toBe(secondPreview)
  })

  test('alias gravado nunca é trocado, nem quando outra passada o propõe de novo', async () => {
    const { graph, previewId } = await readyGraph()
    await db.execute(sql`
      insert into contractor_recipient_aliases (company_id, contractor_id, recipient_code, recipient_tax_id, learned_from_preview_id)
      values (${graph.companyId}, ${graph.contractorId}, '10001', '99999999000199', ${previewId})`)
    await db.transaction((tx) =>
      learnRecipientAliases(tx, {
        aliases: [],
        candidates: [],
        companyId: graph.companyId,
        contractorId: graph.contractorId,
        items: [],
        previewId,
        result: {
          items: [],
          learnedAliases: [{ recipientCode: '10001', recipientTaxId: '11111111000101' }],
          routePairs: [],
        },
      }),
    )
    const rows = await db.execute<{ recipient_tax_id: string }>(
      sql`select recipient_tax_id from contractor_recipient_aliases where company_id = ${graph.companyId}`,
    )
    expect([...rows]).toEqual([{ recipient_tax_id: '99999999000199' }])
  })
})
