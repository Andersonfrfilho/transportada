/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237, revisão de segurança da Fase 4a (S2), contra Postgres: o vínculo segura a trava advisory
 * do contratante, a mesma das ações do operador. Cada prévia tem orçamento; a prévia NOVA que estoura
 * volta inteira e fica `failed` `PREVIEW_MATCH_TIMEOUT`, sem itens; a prévia pronta que estoura numa
 * reavaliação fica como estava; e cada consulta da transação tem prazo.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { afterAll, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'

import { createInProcessCargoPreviewWorkbookReader } from '../../src/cargo-preview/application/read-cargo-preview-workbook.service.js'
import { processCargoPreview } from '../../src/cargo-preview/application/process-cargo-preview.use-case.js'
import { CARGO_PREVIEW_MATCH_STATEMENT_TIMEOUT_MS } from '../../src/cargo-preview/domain/cargo-preview-match-budget.constant.js'
import { createMatchBudget } from '../../src/cargo-preview/application/cargo-preview-match-budget.service.js'
import { matchContractorPreviews } from '../../src/cargo-preview/infrastructure/cargo-preview-matching.writer.js'
import { DrizzleCargoPreviewWorkerRepository } from '../../src/cargo-preview/infrastructure/drizzle-cargo-preview-worker.repository.js'
import { CARGO_PREVIEW_EVENT_TYPE } from '../../src/messaging/cargo-preview-envelope.schema.js'
import {
  createCargoPreviewGraph,
  type CargoPreviewGraph,
} from '../fixtures/cargo-preview-graph.fixture.js'
import { buildCargoPreviewWorkbook } from '../fixtures/cargo-preview-workbook.fixture.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip
const ORDER = {
  Company: '10001',
  'PESO TOTAL': 10,
  PostalCode: '00000101',
  RouteName: 'FR.S.CAR',
  RoutingDate: 46297,
  VALOR: 100,
}
/** Orçamento negativo: a primeira consulta já estoura, sem depender de relógio. */
const EXHAUSTED_BUDGET = { budgetMs: -1, clock: () => 0 }

describeDatabase('o orçamento do vínculo (integration, spec 237 segurança S2)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db
  const repository = new DrizzleCargoPreviewWorkerRepository(db)
  const exhausted = new DrizzleCargoPreviewWorkerRepository(db, EXHAUSTED_BUDGET)

  afterAll(async () => {
    await provider.close()
  })

  async function read(
    graph: CargoPreviewGraph,
    input: { readonly label: string; readonly repository: DrizzleCargoPreviewWorkerRepository },
  ) {
    const bytes = buildCargoPreviewWorkbook({ rows: [{ ...ORDER, Text001: input.label }] })
    const previewId = await graph.seedPreview({ bytes, receivedAt: new Date() })
    const outcome = await processCargoPreview(
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
        now: () => new Date(),
        reader: { read: async () => bytes },
        repository: input.repository,
        workbook: createInProcessCargoPreviewWorkbookReader({ clock: () => performance.now() }),
      },
    )
    return { outcome, previewId }
  }

  async function previewState(previewId: string) {
    const [row] = [
      ...(await db.execute<{ error_code: string | null; items: number; status: string }>(sql`
        select p.status, p.error_code,
          (select count(*)::int from cargo_preview_items i where i.preview_id = p.id) as items
        from cargo_previews p where p.id = ${previewId}`)),
    ]
    return row
  }

  test('a prévia nova que estoura o orçamento fica failed, sem itens, e a trava é solta', async () => {
    const graph = await createCargoPreviewGraph(db)
    const { outcome, previewId } = await read(graph, { label: '1', repository: exhausted })
    expect(outcome).toBe('failed')
    expect(await previewState(previewId)).toEqual({
      error_code: 'PREVIEW_MATCH_TIMEOUT',
      items: 0,
      status: 'failed',
    })
    const next = await read(graph, { label: '2', repository })
    expect(next.outcome).toBe('ready')
  })

  test('a prévia pronta que estoura na reavaliação fica como estava, e o resto segue', async () => {
    const graph = await createCargoPreviewGraph(db)
    const { previewId } = await read(graph, { label: '1', repository })
    await graph.seedDocument({
      number: '1',
      postalCode: '00000101',
      recipientTaxId: '11111111000101',
      value: '100.00',
      weightKg: '10.000',
    })
    const outcome = await exhausted.reevaluate({
      companyId: graph.companyId,
      contractorId: graph.contractorId,
      now: new Date(),
    })
    expect(outcome).toEqual({ aliasConflicts: 0, changedItems: 0, matchTimeouts: 1, previews: 1 })
    expect(await previewState(previewId)).toEqual({ error_code: null, items: 1, status: 'ready' })
    const recovered = await repository.reevaluate({
      companyId: graph.companyId,
      contractorId: graph.contractorId,
      now: new Date(),
    })
    expect(recovered).toMatchObject({ changedItems: 1, matchTimeouts: 0 })
  })

  test('cada consulta da transação do vínculo tem prazo', async () => {
    const graph = await createCargoPreviewGraph(db)
    const timeout = await db.transaction(async (tx) => {
      await matchContractorPreviews(tx, {
        companyId: graph.companyId,
        contractorId: graph.contractorId,
        createBudget: () => createMatchBudget({ budgetMs: 1_000, clock: () => 0 }),
        now: new Date(),
      })
      const [row] = [
        ...(await tx.execute<{ value: string }>(
          sql`select current_setting('statement_timeout') as value`,
        )),
      ]
      return row?.value
    })
    expect(timeout).toBe(`${CARGO_PREVIEW_MATCH_STATEMENT_TIMEOUT_MS / 1_000}s`)
  })
})
