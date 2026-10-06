/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a item 8 contra Postgres: a prévia chega antes do XML, então o caminho principal é o
 * da importação — a nota nova pede a reavaliação (coalescida: um lote vira um pedido), o relay a
 * entrega, e o item vira `matched`. E o pedido que falha nunca derruba a importação.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import type { NfeXmlDocument } from '@adatechnology/fiscal-provider'
import { afterAll, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'

import { processCargoPreview } from '../../src/cargo-preview/application/process-cargo-preview.use-case.js'
import { reevaluateCargoPreviews } from '../../src/cargo-preview/application/reevaluate-cargo-previews.use-case.js'
import { DrizzleCargoPreviewOutboxRepository } from '../../src/cargo-preview/infrastructure/drizzle-cargo-preview-outbox.repository.js'
import { DrizzleCargoPreviewWorkerRepository } from '../../src/cargo-preview/infrastructure/drizzle-cargo-preview-worker.repository.js'
import { CARGO_PREVIEW_EVENT_TYPE } from '../../src/messaging/cargo-preview-envelope.schema.js'
import { writeDocumentChildren } from '../../src/nfe-imports/infrastructure/drizzle-nfe-import-consumer.repository.js'
import {
  CONTRACTOR_TAX_ID,
  createCargoPreviewGraph,
  type CargoPreviewGraph,
} from '../fixtures/cargo-preview-graph.fixture.js'
import { buildCargoPreviewWorkbook } from '../fixtures/cargo-preview-workbook.fixture.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip
const BATCH_SIZE = 300
let sequence = 0

const ROWS = [
  {
    Company: '10001',
    'PESO TOTAL': 10,
    PostalCode: '00000101',
    RouteName: 'FR.S.CAR',
    RoutingDate: 46297,
    VALOR: 100,
  },
]

function documentOf(input: { readonly emitter: string; readonly recipient: string }) {
  return {
    issuer: { name: 'EMITENTE', taxId: input.emitter },
    products: [],
    recipient: {
      address: { city: 'SAO CARLOS', postalCode: '00000101', state: 'SP' },
      name: 'DESTINATARIO',
      taxId: input.recipient,
    },
    volumes: [{ grossWeight: '10.000', netWeight: '10.000', quantity: '1' }],
  } as unknown as NfeXmlDocument
}

describeDatabase('a reavaliação pela importação (integration, spec 237 T4.3)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db
  const repository = new DrizzleCargoPreviewWorkerRepository(db)
  afterAll(async () => {
    await provider.close()
  })

  /** A importação de verdade: a nota e os filhos dela numa transação, como `completeItem`. */
  async function importDocument(
    graph: CargoPreviewGraph,
    input: { emitter?: string; value?: string } = {},
  ) {
    const documentId = await graph.seedDocument({
      bare: true,
      number: String((sequence += 1)),
      recipientTaxId: '11111111000101',
      value: input.value ?? '100.00',
      weightKg: null,
    })
    const warnings: string[] = []
    await db.transaction((tx) =>
      writeDocumentChildren({
        companyId: graph.companyId,
        document: documentOf({
          emitter: input.emitter ?? CONTRACTOR_TAX_ID,
          recipient: '11111111000101',
        }),
        documentId,
        logger: { warn: (message) => void warnings.push(message) },
        tx,
      }),
    )
    return { documentId, warnings }
  }

  async function pendingRequests(companyId: string): Promise<number> {
    const rows = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from cargo_preview_outbox where company_id = ${companyId} and event_type = 'cargo-preview.reevaluate' and published_at is null`,
    )
    return [...rows][0]?.total ?? 0
  }

  async function processedGraph() {
    const graph = await createCargoPreviewGraph(db)
    const bytes = buildCargoPreviewWorkbook({ rows: ROWS, reservedEmptyRows: 3 })
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
        clock: () => performance.now(),
        now: () => new Date(),
        reader: { read: async () => bytes },
        repository,
      },
    )
    return { graph, previewId }
  }

  test('o XML que chega pede a reavaliação, o relay entrega, e o item vira matched', async () => {
    const { graph, previewId } = await processedGraph()
    const { documentId } = await importDocument(graph)
    expect(await pendingRequests(graph.companyId)).toBe(1)

    const outbox = new DrizzleCargoPreviewOutboxRepository(db)
    const early = await outbox.claimDueEntries({
      claimOwner: 'early',
      leaseMs: 1_000,
      limit: 50,
      now: new Date(),
    })
    expect(early.filter((entry) => entry.envelope.companyId === graph.companyId)).toEqual([])
    const due = await outbox.claimDueEntries({
      claimOwner: 'relay',
      leaseMs: 1_000,
      limit: 50,
      now: new Date(Date.now() + 31_000),
    })
    const mine = due.filter((entry) => entry.envelope.companyId === graph.companyId)
    expect(mine.map((entry) => entry.envelope.type)).toEqual([CARGO_PREVIEW_EVENT_TYPE.REEVALUATE])

    await reevaluateCargoPreviews(mine[0]?.envelope as never, { now: () => new Date(), repository })
    const [item] = [
      ...(await db.execute<{ match_state: string; matched_document_id: string }>(
        sql`select match_state, matched_document_id from cargo_preview_items where preview_id = ${previewId}`,
      )),
    ]
    expect(item).toEqual({ match_state: 'matched', matched_document_id: documentId })
  })

  test(`um lote de ${BATCH_SIZE} XMLs vira um pedido só`, async () => {
    const { graph } = await processedGraph()
    for (let index = 0; index < BATCH_SIZE; index += 1) {
      // Uma transação por nota, como a importação; a ordem importa para provar a coalescência.
      await importDocument(graph, { value: `${index + 1}.00` })
    }
    expect(await pendingRequests(graph.companyId)).toBe(1)
  })

  test('sem prévia em aberto, ou de outro emitente, nenhum pedido', async () => {
    const graph = await createCargoPreviewGraph(db)
    await importDocument(graph)
    expect(await pendingRequests(graph.companyId)).toBe(0)
    const { graph: withPreview } = await processedGraph()
    await importDocument(withPreview, { emitter: '11222333000181' })
    expect(await pendingRequests(withPreview.companyId)).toBe(0)
  })

  test('o pedido que falha não derruba a importação: a nota entra, e fica o aviso', async () => {
    const { graph } = await processedGraph()
    const fn = `fail_preview_request_${graph.companyId.replaceAll('-', '')}`
    await db.execute(
      sql.raw(`create function ${fn}() returns trigger language plpgsql as $$
      begin if new.company_id = '${graph.companyId}' then raise exception 'outbox down'; end if; return new; end; $$`),
    )
    await db.execute(
      sql.raw(
        `create trigger ${fn} before insert on cargo_preview_outbox for each row execute function ${fn}()`,
      ),
    )
    try {
      const { documentId, warnings } = await importDocument(graph)
      expect(warnings).toContain('cargo_preview_reevaluation_request_failed')
      const participants = await db.execute<{ total: number }>(
        sql`select count(*)::int as total from nfe_participants where document_id = ${documentId}`,
      )
      expect([...participants][0]?.total).toBe(2)
      expect(await pendingRequests(graph.companyId)).toBe(0)
    } finally {
      await db.execute(sql.raw(`drop trigger if exists ${fn} on cargo_preview_outbox`))
      await db.execute(sql.raw(`drop function if exists ${fn}()`))
    }
  })
})
