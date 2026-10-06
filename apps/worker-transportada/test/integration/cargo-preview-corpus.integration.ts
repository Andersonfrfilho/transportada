/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.3: o corpus ANONIMIZADO da parte A (FR-28-09 e as notas de 25/09) de ponta a ponta —
 * planilha montada das linhas, notas gravadas com `NroCarga` no `infCpl`, leitura e vínculo pelo
 * banco. O resultado tem de ser o da política pura sobre os mesmos dados: o caminho do banco não
 * pode perder nem inventar vínculo. Os dados são lidos como DADO da pasta de fixtures da API.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { afterAll, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'

import { processCargoPreview } from '../../src/cargo-preview/application/process-cargo-preview.use-case.js'
import { DrizzleCargoPreviewWorkerRepository } from '../../src/cargo-preview/infrastructure/drizzle-cargo-preview-worker.repository.js'
import { resolveCargoPreviewMatches } from '../../src/cargo-receiving/domain/cargo-preview-matching.policy.js'
import { CARGO_PREVIEW_EVENT_TYPE } from '../../src/messaging/cargo-preview-envelope.schema.js'
import { createCargoPreviewGraph } from '../fixtures/cargo-preview-graph.fixture.js'
import { buildCargoPreviewWorkbook } from '../fixtures/cargo-preview-workbook.fixture.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip
const CORPUS = '../api-transportada/test/fixtures/cargo-preview-corpus'

type CorpusItem = Readonly<Record<string, string | number | null>>
type CorpusDocument = Readonly<Record<string, string | null>>

function toRow(item: CorpusItem) {
  const text = (key: string) => (item[key] === null ? undefined : String(item[key]))
  const number = (key: string) => (item[key] === null ? undefined : { raw: String(item[key]) })
  return {
    City: text('city'),
    Company: text('recipientCode'),
    CompanyName: text('recipientName'),
    'PESO TOTAL': number('weightKg'),
    PostalCode: text('postalCode'),
    RouteName: text('routeName'),
    RoutingDate: text('routingDate'),
    State: text('state'),
    Text001: text('contractorReference'),
    VALOR: number('value'),
    'VOLUME(M3)': number('volumeM3'),
  }
}

describeDatabase('o corpus FR-28-09 pelo banco (integration, spec 237 T4.3)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  afterAll(async () => {
    await provider.close()
  })

  test('a leitura e o vínculo pelo banco dão o mesmo que a política pura', async () => {
    const items = (await Bun.file(`${CORPUS}/fr-28-09.items.json`).json()) as CorpusItem[]
    const documents = (
      (await Bun.file(`${CORPUS}/documents.json`).json()) as CorpusDocument[]
    ).filter((document) => String(document.issuedAt).startsWith('2026-09-25'))
    const graph = await createCargoPreviewGraph(provider.db)
    await Promise.all(
      documents.map((document) =>
        graph.seedDocument({
          ...(document.loadReference === null ? {} : { loadReference: document.loadReference }),
          number: String(document.number),
          ...(document.recipientPostalCode === null
            ? {}
            : { postalCode: document.recipientPostalCode }),
          ...(document.recipientName === null ? {} : { recipientName: document.recipientName }),
          recipientTaxId: String(document.recipientTaxId),
          value: String(document.totalValue),
          weightKg: document.grossWeightKg ?? null,
        }),
      ),
    )
    const bytes = buildCargoPreviewWorkbook({ rows: items.map(toRow) })
    const previewId = await graph.seedPreview({
      bytes,
      receivedAt: new Date(Date.now() - 3_600_000),
    })

    const outcome = await processCargoPreview(
      {
        companyId: graph.companyId,
        correlationId: 'corpus',
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
        repository: new DrizzleCargoPreviewWorkerRepository(provider.db),
      },
    )
    expect(outcome).toBe('ready')

    const rows = await provider.db.execute<{ match_state: string; total: number }>(
      sql`select match_state, count(*)::int as total from cargo_preview_items where preview_id = ${previewId} group by match_state`,
    )
    const fromDatabase = Object.fromEntries([...rows].map((row) => [row.match_state, row.total]))
    const pure = resolveCargoPreviewMatches({
      candidates: documents.map((document) => ({
        grossWeightKg: document.grossWeightKg ?? undefined,
        id: String(document.id),
        issuedAt: String(document.issuedAt),
        loadReference: document.loadReference ?? undefined,
        number: String(document.number),
        recipientCity: document.recipientCity ?? undefined,
        recipientName: document.recipientName ?? undefined,
        recipientPostalCode: document.recipientPostalCode ?? undefined,
        recipientTaxId: document.recipientTaxId ?? undefined,
        totalValue: String(document.totalValue),
      })),
      items: items.map((item) => ({
        city: item.city === null ? undefined : String(item.city),
        itemKey: String(item.rowNumber),
        postalCode: item.postalCode === null ? undefined : String(item.postalCode),
        recipientCode: item.recipientCode === null ? undefined : String(item.recipientCode),
        recipientName: item.recipientName === null ? undefined : String(item.recipientName),
        routeName: String(item.routeName),
        value: String(item.value),
        weightKg: String(item.weightKg),
      })),
      knownAliases: [],
      knownRoutePairs: [],
      weightTolerancePercent: 0,
    })
    const expected: Record<string, number> = {}
    for (const match of pure.items) expected[match.state] = (expected[match.state] ?? 0) + 1
    expect(fromDatabase).toEqual(expected)
    expect(fromDatabase.matched).toBeGreaterThanOrEqual(90)
  })
})
