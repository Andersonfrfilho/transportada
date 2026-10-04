/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 contra Postgres (correção da revisão da Fase 4a, H2 e M1): número que o banco recusa
 * (22003) vira erro tipado e a transação não deixa nada pela metade; e a prévia que falhou por um
 * perfil mal mapeado é lida de novo quando a API a reabre depois de o perfil ser corrigido.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { afterAll, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'

import { CargoPreviewValueOutOfRangeError } from '../../src/cargo-preview/application/cargo-preview-value-out-of-range.error.js'
import { processCargoPreview } from '../../src/cargo-preview/application/process-cargo-preview.use-case.js'
import type { NewPreviewItem } from '../../src/cargo-preview/domain/cargo-preview-items.policy.js'
import { DrizzleCargoPreviewWorkerRepository } from '../../src/cargo-preview/infrastructure/drizzle-cargo-preview-worker.repository.js'
import { CARGO_PREVIEW_EVENT_TYPE } from '../../src/messaging/cargo-preview-envelope.schema.js'
import {
  createCargoPreviewGraph,
  type CargoPreviewGraph,
} from '../fixtures/cargo-preview-graph.fixture.js'
import {
  buildCargoPreviewWorkbook,
  FR_COLUMN_MAP,
} from '../fixtures/cargo-preview-workbook.fixture.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const ITEM: NewPreviewItem = {
  address: null,
  city: null,
  contractorReference: null,
  matchState: 'awaiting_xml',
  neighborhood: null,
  postalCode: null,
  recipientCode: '10001',
  recipientName: null,
  routeName: 'FR.S.CAR',
  routingDate: null,
  rowError: null,
  rowNumber: 6,
  state: null,
  value: '100.00',
  volumeM3: null,
  weightKg: '10.000',
}

describeDatabase('a prévia que falha no banco ou no perfil (integration, spec 237 H2/M1)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db
  const repository = new DrizzleCargoPreviewWorkerRepository(db)

  afterAll(async () => {
    await provider.close()
  })

  async function previewRow(previewId: string) {
    const [row] = [
      ...(await db.execute<{ error_code: string | null; items: number; status: string }>(sql`
        select status, error_code,
          (select count(*)::int from cargo_preview_items where preview_id = ${previewId}) as items
        from cargo_previews where id = ${previewId}`)),
    ]
    return row
  }

  function process(graph: CargoPreviewGraph, input: { bytes: Uint8Array; previewId: string }) {
    return processCargoPreview(
      {
        companyId: graph.companyId,
        correlationId: 'integration',
        eventId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        payload: {
          bucket: 'b',
          contractorId: graph.contractorId,
          objectKey: 'k',
          previewId: input.previewId,
        },
        type: CARGO_PREVIEW_EVENT_TYPE.PROCESS,
        version: 1,
      },
      {
        clock: () => performance.now(),
        now: () => new Date(),
        reader: { read: async () => input.bytes },
        repository,
      },
    )
  }

  test('valor maior que a coluna: erro tipado, e nenhum item fica gravado', async () => {
    const graph = await createCargoPreviewGraph(db)
    const previewId = await graph.seedPreview({
      bytes: new Uint8Array([1]),
      receivedAt: new Date(),
    })
    const store = repository.storeParsed({
      companyId: graph.companyId,
      contractorId: graph.contractorId,
      now: new Date(),
      plan: {
        items: [ITEM, { ...ITEM, rowNumber: 7, value: '1000000000000.00' }],
        plannedDate: null,
        rowCount: 2,
      },
      previewId,
      sheetName: null,
    })
    expect(await store.catch((error: unknown) => error)).toBeInstanceOf(
      CargoPreviewValueOutOfRangeError,
    )
    expect(await previewRow(previewId)).toEqual({ error_code: null, items: 0, status: 'queued' })
  })

  test('coluna mal mapeada falha; perfil corrigido e prévia reaberta, o mesmo arquivo é lido', async () => {
    const graph = await createCargoPreviewGraph(db)
    const bytes = buildCargoPreviewWorkbook({
      rows: [{ 'PESO TOTAL': 10, RouteName: 'FR.S.CAR', RoutingDate: 46297, VALOR: 100 }],
    })
    const previewId = await graph.seedPreview({ bytes, receivedAt: new Date() })
    const brokenMap = { ...FR_COLUMN_MAP, value: 'VALOR TOTAL' }
    const setMap = (map: Record<string, string>) =>
      db.execute(sql`
        update contractor_receiving_profiles set preview_column_map = ${JSON.stringify(map)}::text::jsonb
        where company_id = ${graph.companyId}`)

    await setMap(brokenMap)
    expect(await process(graph, { bytes, previewId })).toBe('failed')
    expect(await previewRow(previewId)).toEqual({
      error_code: 'PREVIEW_COLUMN_NOT_FOUND',
      items: 0,
      status: 'failed',
    })

    await setMap(FR_COLUMN_MAP)
    // O que a API faz ao reenvio do mesmo arquivo (`reopenPreview`): a mesma prévia volta à fila.
    await db.execute(
      sql`update cargo_previews set status = 'queued', error_code = null where id = ${previewId}`,
    )
    expect(await process(graph, { bytes, previewId })).toBe('ready')
    expect(await previewRow(previewId)).toEqual({ error_code: null, items: 1, status: 'ready' })
  })
})
