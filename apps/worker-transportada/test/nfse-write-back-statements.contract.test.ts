/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableName, type SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { DrizzleNfseIssuanceWriteBackRepository } from '../src/nfse-issuance/infrastructure/drizzle-nfse-issuance-write-back.repository.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type RecordedStatement = {
  readonly columns: readonly string[]
  readonly kind: 'insert' | 'update'
  readonly params: readonly unknown[]
  readonly sql: string
  readonly table: string
  readonly values: Record<string, unknown>
}

const ATTEMPT_ID = '00000000-0000-4000-8000-0000000000c1'
const COMPANY_ID = '00000000-0000-4000-8000-0000000000c2'
const INVOICE_ID = '00000000-0000-4000-8000-0000000000c3'
const OCCURRED_AT = new Date('2026-08-12T12:00:00.000Z')

const CANCELLATION_KEY = {
  attemptId: ATTEMPT_ID,
  companyId: COMPANY_ID,
  invoiceId: INVOICE_ID,
  occurredAt: OCCURRED_AT,
} as const

const ATTEMPTS_TABLE = 'nfse_issuance_attempts'
const FISCAL_DOCUMENTS_TABLE = 'nfse_fiscal_documents'
const INVOICES_TABLE = 'nfse_service_invoices'

const dialect = new PgDialect()

/** Grava cada statement da transação em vez de falar com o Postgres — o assunto aqui é o SQL. */
function createRecordingDatabase(input: {
  readonly settledAttempt?: boolean
  readonly statements: RecordedStatement[]
}): Database {
  const record = (statement: RecordedStatement): RecordedStatement => {
    input.statements.push(statement)
    return statement
  }

  const transaction = {
    insert: (table: Parameters<typeof getTableName>[0]) => ({
      values: (values: Record<string, unknown>) =>
        Promise.resolve(
          record({
            columns: Object.keys(values),
            kind: 'insert',
            params: [],
            sql: '',
            table: getTableName(table),
            values,
          }),
        ),
    }),
    update: (table: Parameters<typeof getTableName>[0]) => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: SQL | undefined) => {
          const query = dialect.sqlToQuery(condition!)
          record({
            columns: Object.keys(values),
            kind: 'update',
            params: query.params,
            sql: query.sql,
            table: getTableName(table),
            values,
          })

          const rows = input.settledAttempt === true ? [] : [{ id: ATTEMPT_ID }]
          const settled = Promise.resolve(rows)
          return Object.assign(settled, { returning: () => settled })
        },
      }),
    }),
  }

  return {
    transaction: async (callback: (scoped: typeof transaction) => Promise<void>) => {
      await callback(transaction)
    },
  } as unknown as Database
}

function findStatement(
  statements: readonly RecordedStatement[],
  table: string,
): RecordedStatement | undefined {
  return statements.find((candidate) => candidate.table === table)
}

describe('NFS-e cancellation write-back statements', () => {
  /**
   * A nota cancelada na prefeitura não pode continuar `authorized` no registro fiscal: é a linha que
   * a auditoria lê. O trilho síncrono do worker escreve pelo mesmo recorte do job de reconciliação.
   */
  test('marks the fiscal document as cancelled beside the invoice', async () => {
    const statements: RecordedStatement[] = []

    await new DrizzleNfseIssuanceWriteBackRepository(
      createRecordingDatabase({ statements }),
    ).recordCancellationConfirmed(CANCELLATION_KEY)

    const document = findStatement(statements, FISCAL_DOCUMENTS_TABLE)
    if (document === undefined) throw new Error('NFSE_FISCAL_DOCUMENT_CANCELLATION_MISSING')

    expect(document.kind).toBe('update')
    expect(document.values).toMatchObject({
      cancelledAt: OCCURRED_AT,
      status: 'cancelled',
      updatedAt: OCCURRED_AT,
    })
    expect(document.sql).toContain('"nfse_fiscal_documents"."company_id" = $')
    expect(document.sql).toContain('"nfse_fiscal_documents"."invoice_id" = $')
    expect(document.params).toEqual([COMPANY_ID, INVOICE_ID])
  })

  test('cancels the document before closing the invoice', async () => {
    const statements: RecordedStatement[] = []

    await new DrizzleNfseIssuanceWriteBackRepository(
      createRecordingDatabase({ statements }),
    ).recordCancellationConfirmed(CANCELLATION_KEY)

    const tables = statements.map((statement) => statement.table)
    expect(tables.indexOf(FISCAL_DOCUMENTS_TABLE)).toBeGreaterThan(tables.indexOf(ATTEMPTS_TABLE))
    expect(tables.indexOf(FISCAL_DOCUMENTS_TABLE)).toBeLessThan(tables.indexOf(INVOICES_TABLE))
  })

  /** Tentativa já liquidada por uma entrega anterior: a transação para na linha da tentativa. */
  test('touches nothing else when the attempt was already settled', async () => {
    const statements: RecordedStatement[] = []

    await new DrizzleNfseIssuanceWriteBackRepository(
      createRecordingDatabase({ settledAttempt: true, statements }),
    ).recordCancellationConfirmed(CANCELLATION_KEY)

    expect(statements.map((statement) => statement.table)).toEqual([ATTEMPTS_TABLE])
  })

  /** Emissão aceita não toca no registro fiscal: quem o cria é a reconciliação, na autorização. */
  test('an accepted issue never writes to the fiscal document table', async () => {
    const statements: RecordedStatement[] = []

    await new DrizzleNfseIssuanceWriteBackRepository(
      createRecordingDatabase({ statements }),
    ).recordAccepted({ ...CANCELLATION_KEY, providerDocumentId: 'provider-document-1' })

    expect(findStatement(statements, FISCAL_DOCUMENTS_TABLE)).toBeUndefined()
  })
})
