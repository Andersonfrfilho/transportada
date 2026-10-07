/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a item 8: toda nota nova pede a reavaliação do contratante do emitente, num savepoint
 * próprio — e o pedido que falha vira aviso, nunca erro da importação.
 */
import type { NfeXmlDocument } from '@adatechnology/fiscal-provider'
import { describe, expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

import type { NfeWriteTransaction } from '../../src/nfe-documents/types/nfe-write-transaction.types.js'
import { writeDocumentChildren } from '../../src/nfe-imports/infrastructure/drizzle-nfe-import-consumer.repository.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000c1'
const EMITTER = '30290856000160'
const DOCUMENT = {
  issuer: { name: 'EMITENTE', taxId: EMITTER },
  products: [],
  recipient: { name: 'DESTINATARIO', taxId: '44555666000172' },
  volumes: [],
} as unknown as NfeXmlDocument

function createTransaction(input: { readonly savepointFails: boolean }) {
  const statements: SQL[] = []
  const tx = {
    insert: () => ({ values: async () => undefined }),
    async transaction(work: (savepoint: unknown) => Promise<void>) {
      if (input.savepointFails) throw new Error('relation does not exist')
      await work({ execute: async (statement: SQL) => void statements.push(statement) })
    },
  }
  return { statements, tx: tx as unknown as NfeWriteTransaction }
}

describe('a nota nova pede a reavaliação da prévia (spec 237 T4.3)', () => {
  test('pede no savepoint, pelo CNPJ do emitente e pela empresa, coalescido e adiado', async () => {
    const { statements, tx } = createTransaction({ savepointFails: false })
    await writeDocumentChildren({ companyId: COMPANY_ID, document: DOCUMENT, documentId: 'd', tx })

    const request = statements
      .map((statement) => new PgDialect().sqlToQuery(statement))
      .find((query) => query.sql.includes('cargo_preview_outbox'))
    expect(request?.sql).toContain('pending.published_at is null')
    expect(request?.sql).toContain('pending.next_attempt_at > clock_timestamp()')
    expect(request?.params).toEqual(
      expect.arrayContaining([COMPANY_ID, EMITTER, 30, 10, 'cargo-preview.reevaluate']),
    )
  })

  test('o pedido que falha vira aviso sem CNPJ e a importação segue', async () => {
    const { tx } = createTransaction({ savepointFails: true })
    const warnings: { message: string; metadata: unknown }[] = []
    await writeDocumentChildren({
      companyId: COMPANY_ID,
      document: DOCUMENT,
      documentId: 'd',
      logger: { warn: (message, metadata) => void warnings.push({ message, metadata }) },
      tx,
    })
    const warning = warnings.find(
      (entry) => entry.message === 'cargo_preview_reevaluation_request_failed',
    )
    expect(warning?.metadata).toEqual({ companyId: COMPANY_ID, reason: 'Error' })
    expect(JSON.stringify(warnings)).not.toContain(EMITTER)
  })
})
