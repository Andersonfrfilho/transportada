/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a contra Postgres (correção da revisão da Fase 4a, M3): ler uma prévia nova vincula
 * TODAS as prontas do contratante, da mais antiga para a mais nova (ADR-0094 §8). Com um pedido
 * recorrente idêntico em duas prévias, a nota que chegou antes da leitura da nova é da mais antiga —
 * a ordem em que leitura e reavaliação chegam não muda o resultado.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { afterAll, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'

import { processCargoPreview } from '../../src/cargo-preview/application/process-cargo-preview.use-case.js'
import { DrizzleCargoPreviewWorkerRepository } from '../../src/cargo-preview/infrastructure/drizzle-cargo-preview-worker.repository.js'
import { CARGO_PREVIEW_EVENT_TYPE } from '../../src/messaging/cargo-preview-envelope.schema.js'
import {
  createCargoPreviewGraph,
  type CargoPreviewGraph,
} from '../fixtures/cargo-preview-graph.fixture.js'
import { buildCargoPreviewWorkbook } from '../fixtures/cargo-preview-workbook.fixture.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip
const HOUR_MS = 3_600_000

const RECURRING_ORDER = {
  Company: '10001',
  'PESO TOTAL': 10,
  PostalCode: '00000101',
  RouteName: 'FR.S.CAR',
  RoutingDate: 46297,
  VALOR: 100,
}

describeDatabase('a ordem das prévias no vínculo (integration, spec 237 M3)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db
  const repository = new DrizzleCargoPreviewWorkerRepository(db)

  afterAll(async () => {
    await provider.close()
  })

  async function readPreview(graph: CargoPreviewGraph, input: { label: string; ageHours: number }) {
    const bytes = buildCargoPreviewWorkbook({
      rows: [{ ...RECURRING_ORDER, Text001: input.label }],
    })
    const previewId = await graph.seedPreview({
      bytes,
      receivedAt: new Date(Date.now() - input.ageHours * HOUR_MS),
    })
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
        clock: () => performance.now(),
        now: () => new Date(),
        reader: { read: async () => bytes },
        repository,
      },
    )
    expect(outcome).toBe('ready')
    return previewId
  }

  test('a leitura da prévia nova não rouba a nota que a mais antiga esperava', async () => {
    const graph = await createCargoPreviewGraph(db)
    const older = await readPreview(graph, { ageHours: 3, label: '500001' })
    // A nota chega e a reavaliação dela ainda está adiada no outbox quando a prévia nova é lida.
    const documentId = await graph.seedDocument({
      number: '1',
      postalCode: '00000101',
      recipientTaxId: '11111111000101',
      value: '100.00',
      weightKg: '10.000',
    })
    const newer = await readPreview(graph, { ageHours: 1, label: '500002' })

    const links = await db.execute<{ document_id: string; preview_id: string }>(
      sql`select preview_id, document_id from cargo_preview_document_links where company_id = ${graph.companyId}`,
    )
    expect([...links]).toEqual([{ document_id: documentId, preview_id: older }])
    const [waiting] = [
      ...(await db.execute<{ match_state: string }>(
        sql`select match_state from cargo_preview_items where preview_id = ${newer}`,
      )),
    ]
    expect(waiting?.match_state).toBe('awaiting_xml')
  })
})
