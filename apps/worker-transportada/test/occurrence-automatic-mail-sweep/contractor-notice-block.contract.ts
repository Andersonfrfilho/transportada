/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 (D2, CA01): o varredor é um dos quatro pontos que falam com a contratante, e a API não o alcança (nenhuma app
 * importa código de outra). A regra `occurrenceTypeNeverNotifiesContractor` da API é `blocks_contractor_notice = true`;
 * aqui ela é cópia por valor no SQL da fila. Este contrato monta a consulta de verdade e reprova se o filtro sumir —
 * o par do lado da API é `occurrence-contractor-notice.contract.ts`, que fixa o nome da coluna.
 */
import { describe, expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

import {
  createDrizzleOccurrenceAutomaticMailQueue,
  type OccurrenceAutomaticMailDatabase,
} from '../../src/occurrence-automatic-mail-sweep/infrastructure/drizzle-occurrence-automatic-mail-queue.repository.js'

async function renderPendingQuery(): Promise<string> {
  const captured: SQL[] = []
  const database = {
    execute: async (query: SQL) => {
      captured.push(query)
      return []
    },
  } as unknown as OccurrenceAutomaticMailDatabase
  await createDrizzleOccurrenceAutomaticMailQueue(database).listPending({
    createdAfter: new Date('2026-11-10T00:00:00.000Z'),
    createdBefore: new Date('2026-11-10T01:00:00.000Z'),
    excludeOccurrenceIds: [],
    limit: 10,
  })
  const [query] = captured
  if (query === undefined) throw new Error('the queue must query the database')
  return new PgDialect().sqlToQuery(query).sql
}

describe('a fila do varredor nunca pega tipo que não avisa a contratante (spec 321 D2)', () => {
  test('o filtro da marca está no SQL, ao lado do emails_contractor', async () => {
    const text = await renderPendingQuery()
    expect(text).toContain('t."emails_contractor" = true')
    expect(text).toContain('t."blocks_contractor_notice" = false')
  })
})
