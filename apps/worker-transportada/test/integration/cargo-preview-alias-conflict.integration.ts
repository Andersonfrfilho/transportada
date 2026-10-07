/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237, revisão de segurança da Fase 4a (S6), contra Postgres: o alias contrariado por um vínculo
 * reforçado é invalidado no banco E na mesma passada — a prévia seguinte da reavaliação não o usa
 * como reforço para ligar outra linha do mesmo código ao destinatário antigo.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { afterAll, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'

import { createInProcessCargoPreviewWorkbookReader } from '../../src/cargo-preview/application/read-cargo-preview-workbook.service.js'
import { processCargoPreview } from '../../src/cargo-preview/application/process-cargo-preview.use-case.js'
import { DrizzleCargoPreviewWorkerRepository } from '../../src/cargo-preview/infrastructure/drizzle-cargo-preview-worker.repository.js'
import { CARGO_PREVIEW_EVENT_TYPE } from '../../src/messaging/cargo-preview-envelope.schema.js'
import {
  createCargoPreviewGraph,
  type CargoPreviewGraph,
} from '../fixtures/cargo-preview-graph.fixture.js'
import {
  buildCargoPreviewWorkbook,
  type FixtureRow,
} from '../fixtures/cargo-preview-workbook.fixture.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip
const HOUR_MS = 3_600_000
const OLD_TAX_ID = '99999999000199'

describeDatabase('o alias contrariado sai da passada (integration, spec 237 segurança S6)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db
  const repository = new DrizzleCargoPreviewWorkerRepository(db)

  afterAll(async () => {
    await provider.close()
  })

  async function readPreview(
    graph: CargoPreviewGraph,
    input: { ageHours: number; row: FixtureRow },
  ) {
    const bytes = buildCargoPreviewWorkbook({ reservedEmptyRows: 3, rows: [input.row] })
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
        bucket: 'integration',
        now: () => new Date(),
        reader: { read: async () => bytes },
        repository,
        workbook: createInProcessCargoPreviewWorkbookReader({ clock: () => performance.now() }),
      },
    )
    expect(outcome).toBe('ready')
    return previewId
  }

  async function stateOf(previewId: string): Promise<string | undefined> {
    const [row] = [
      ...(await db.execute<{ match_state: string }>(
        sql`select match_state from cargo_preview_items where preview_id = ${previewId}`,
      )),
    ]
    return row?.match_state
  }

  test('a prévia seguinte não liga pelo alias que a anterior acabou de invalidar', async () => {
    const graph = await createCargoPreviewGraph(db)
    const base = { Company: '10001', RouteName: 'FR.S.CAR', RoutingDate: 46297 }
    const older = await readPreview(graph, {
      ageHours: 3,
      row: { ...base, 'PESO TOTAL': 10, PostalCode: '00000101', VALOR: 100 },
    })
    const newer = await readPreview(graph, {
      ageHours: 1,
      row: { ...base, 'PESO TOTAL': 7, VALOR: 70 },
    })
    await db.execute(sql`
      insert into contractor_recipient_aliases (company_id, contractor_id, recipient_code, recipient_tax_id, learned_from_preview_id)
      values (${graph.companyId}, ${graph.contractorId}, '10001', ${OLD_TAX_ID}, ${older})`)
    await graph.seedDocument({
      number: '1',
      postalCode: '00000101',
      recipientTaxId: '11111111000101',
      value: '100.00',
      weightKg: '10.000',
    })
    await graph.seedDocument({
      number: '2',
      recipientTaxId: OLD_TAX_ID,
      value: '70.00',
      weightKg: '7.000',
    })

    const outcome = await repository.reevaluate({ ...graph, now: new Date() })

    expect(outcome.aliasConflicts).toBe(1)
    expect(await stateOf(older)).toBe('matched')
    expect(await stateOf(newer)).toBe('suggested')
    const aliases = await db.execute(
      sql`select 1 from contractor_recipient_aliases where company_id = ${graph.companyId} and recipient_code = '10001'`,
    )
    expect([...aliases]).toEqual([])
  })
})
