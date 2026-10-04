/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a item 8 contra Postgres (correção da revisão da Fase 4a, M4 e L2). A corrida: a
 * importação vê um pedido pendente e não grava outro; o relay publica esse pedido e a reavaliação lê
 * as notas ANTES de a importação comitar — a nota nova nunca é reavaliada. A intercalação é
 * injetada: o pedido pendente está a segundos de sair, a transação da importação fica aberta
 * enquanto a reavaliação roda, e só então comita. E a prévia fora da janela não pede reavaliação.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import type { NfeXmlDocument } from '@adatechnology/fiscal-provider'
import { afterAll, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'

import { processCargoPreview } from '../../src/cargo-preview/application/process-cargo-preview.use-case.js'
import { DrizzleCargoPreviewWorkerRepository } from '../../src/cargo-preview/infrastructure/drizzle-cargo-preview-worker.repository.js'
import { CARGO_PREVIEW_EVENT_TYPE } from '../../src/messaging/cargo-preview-envelope.schema.js'
import { CARGO_PREVIEW_REEVALUATION_COALESCE_MARGIN_SECONDS } from '../../src/nfe-imports/infrastructure/cargo-preview-reevaluation.writer.js'
import { writeDocumentChildren } from '../../src/nfe-imports/infrastructure/drizzle-nfe-import-consumer.repository.js'
import {
  CONTRACTOR_TAX_ID,
  createCargoPreviewGraph,
  type CargoPreviewGraph,
} from '../fixtures/cargo-preview-graph.fixture.js'
import { buildCargoPreviewWorkbook } from '../fixtures/cargo-preview-workbook.fixture.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip
const DAY_MS = 86_400_000
let sequence = 0
const ROW = {
  Company: '10001',
  'PESO TOTAL': 10,
  PostalCode: '00000101',
  RouteName: 'FR.S.CAR',
  RoutingDate: 46297,
  VALOR: 100,
}
const DOCUMENT = {
  issuer: { name: 'EMITENTE', taxId: CONTRACTOR_TAX_ID },
  products: [],
  recipient: {
    address: { city: 'SAO CARLOS', postalCode: '00000101', state: 'SP' },
    name: 'DESTINATARIO',
    taxId: '11111111000101',
  },
  volumes: [{ grossWeight: '10.000', netWeight: '10.000', quantity: '1' }],
} as unknown as NfeXmlDocument

describeDatabase('a reavaliação não se perde na corrida (integration, spec 237 M4/L2)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db
  const repository = new DrizzleCargoPreviewWorkerRepository(db)
  afterAll(async () => {
    await provider.close()
  })

  async function readyPreview(graph: CargoPreviewGraph, receivedAt: Date) {
    const bytes = buildCargoPreviewWorkbook({ rows: [ROW], reservedEmptyRows: 3 })
    const previewId = await graph.seedPreview({ bytes, receivedAt })
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
        clock: () => performance.now(),
        now: () => new Date(),
        reader: { read: async () => bytes },
        repository,
      },
    )
    return previewId
  }

  async function pendingRequests(companyId: string): Promise<number> {
    const rows = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from cargo_preview_outbox where company_id = ${companyId} and event_type = 'cargo-preview.reevaluate' and published_at is null`,
    )
    return [...rows][0]?.total ?? 0
  }

  async function seedPendingRequest(graph: CargoPreviewGraph, dueInSeconds: number) {
    await db.execute(sql`
      insert into cargo_preview_outbox (company_id, contractor_id, event_type, correlation_id, payload, next_attempt_at)
      values (${graph.companyId}, ${graph.contractorId}, 'cargo-preview.reevaluate', 'seeded',
        jsonb_build_object('contractorId', ${graph.contractorId}::text),
        clock_timestamp() + make_interval(secs => ${dueInSeconds}))`)
  }

  async function importInOpenTransaction(graph: CargoPreviewGraph, whileOpen: () => Promise<void>) {
    const documentId = await graph.seedDocument({
      bare: true,
      number: String((sequence += 1)),
      recipientTaxId: '11111111000101',
      value: '100.00',
      weightKg: null,
    })
    await db.transaction(async (tx) => {
      await writeDocumentChildren({
        companyId: graph.companyId,
        document: DOCUMENT,
        documentId,
        tx,
      })
      await whileOpen()
    })
    return documentId
  }

  test('pedido pendente prestes a sair não coalesce: a nota importada ganha o seu pedido', async () => {
    expect(CARGO_PREVIEW_REEVALUATION_COALESCE_MARGIN_SECONDS).toBe(10)
    const graph = await createCargoPreviewGraph(db)
    const previewId = await readyPreview(graph, new Date(Date.now() - 3_600_000))
    await seedPendingRequest(graph, 2)

    const documentId = await importInOpenTransaction(graph, async () => {
      // O pedido antigo sai e é consumido com a importação ainda aberta: a nota não é vista.
      await db.execute(sql`
        update cargo_preview_outbox set published_at = now()
        where company_id = ${graph.companyId} and correlation_id = 'seeded'`)
      await repository.reevaluate({ ...graph, now: new Date() })
    })

    expect(await pendingRequests(graph.companyId)).toBe(1)
    await repository.reevaluate({ ...graph, now: new Date() })
    const [item] = [
      ...(await db.execute<{ matched_document_id: string | null }>(
        sql`select matched_document_id from cargo_preview_items where preview_id = ${previewId}`,
      )),
    ]
    expect(item?.matched_document_id).toBe(documentId)
  })

  test('pedido pendente com folga continua coalescendo', async () => {
    const graph = await createCargoPreviewGraph(db)
    await readyPreview(graph, new Date(Date.now() - 3_600_000))
    await seedPendingRequest(graph, 30)
    await importInOpenTransaction(graph, async () => undefined)
    expect(await pendingRequests(graph.companyId)).toBe(1)
  })

  test('prévia fora da janela do perfil não pede reavaliação (L2)', async () => {
    const graph = await createCargoPreviewGraph(db)
    await readyPreview(graph, new Date(Date.now() - 20 * DAY_MS))
    await importInOpenTransaction(graph, async () => undefined)
    expect(await pendingRequests(graph.companyId)).toBe(0)
  })
})
