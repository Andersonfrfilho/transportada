/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableName, type SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { DrizzleMdfeIssuanceWriteBackRepository } from '../src/mdfe-issuance/infrastructure/drizzle-mdfe-issuance-write-back.repository.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type RecordedStatement = {
  readonly columns: readonly string[]
  readonly kind: 'insert' | 'update'
  readonly params: readonly unknown[]
  readonly sql: string
  readonly table: string
  readonly values: Record<string, unknown>
}

const ATTEMPT_ID = '00000000-0000-4000-8000-0000000000b1'
const COMPANY_ID = '00000000-0000-4000-8000-0000000000b2'
const MANIFEST_ID = '00000000-0000-4000-8000-0000000000b3'
const OCCURRED_AT = new Date('2026-07-29T12:00:00.000Z')

const CANCELLED_INPUT = {
  accessKey: '35260712345678000190580010000000011000000015',
  attemptId: ATTEMPT_ID,
  cancellationProtocol: '135260000998877',
  companyId: COMPANY_ID,
  manifestId: MANIFEST_ID,
  occurredAt: OCCURRED_AT,
} as const

const MANIFEST_ITEMS_TABLE = 'mdfe_manifest_items'
const ATTEMPTS_TABLE = 'mdfe_issuance_attempts'
const ISSUANCE_EVENTS_TABLE = 'mdfe_issuance_events'

const REJECTION_CODE = '726'
const REJECTION_MESSAGE = 'Rejeicao: Numero do MDF-e ja utilizado'

const REJECTED_INPUT = {
  attemptId: ATTEMPT_ID,
  companyId: COMPANY_ID,
  errorCode: REJECTION_CODE,
  errorMessage: REJECTION_MESSAGE,
  manifestId: MANIFEST_ID,
  occurredAt: OCCURRED_AT,
} as const

const dialect = new PgDialect()

/** Grava cada statement da transação em vez de falar com o Postgres — o assunto aqui é o SQL. */
function createRecordingDatabase(input: {
  readonly settledAttempt?: boolean
  readonly statements: RecordedStatement[]
}): { readonly database: Database; readonly transactions: () => number } {
  let transactions = 0

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
    database: {
      transaction: async (callback: (scoped: typeof transaction) => Promise<void>) => {
        transactions += 1
        await callback(transaction)
      },
    } as unknown as Database,
    transactions: () => transactions,
  }
}

function findItemRelease(statements: readonly RecordedStatement[]): RecordedStatement | undefined {
  return statements.find((statement) => statement.table === MANIFEST_ITEMS_TABLE)
}

function findStatement(statements: readonly RecordedStatement[], table: string): RecordedStatement {
  const statement = statements.find((candidate) => candidate.table === table)
  if (statement === undefined) throw new Error(`MDFE_STATEMENT_MISSING:${table}`)
  return statement
}

describe('MDF-e cancellation write-back contract', () => {
  test('releases every live item of the manifest when SEFAZ confirms the 110111', async () => {
    const statements: RecordedStatement[] = []
    const { database, transactions } = createRecordingDatabase({ statements })

    await new DrizzleMdfeIssuanceWriteBackRepository(database).recordCancelled(CANCELLED_INPUT)

    const release = findItemRelease(statements)
    if (release === undefined) throw new Error('MDFE_MANIFEST_ITEM_RELEASE_MISSING')

    expect(release.kind).toBe('update')
    expect(release.columns).toEqual(['releasedAt'])
    expect(release.sql).toContain('"mdfe_manifest_items"."company_id" = $')
    expect(release.sql).toContain('"mdfe_manifest_items"."manifest_id" = $')
    expect(release.sql).toContain('"mdfe_manifest_items"."released_at" is null')
    expect(release.params).toEqual([COMPANY_ID, MANIFEST_ID])
    expect(transactions()).toBe(1)
  })

  test('releases the items before closing the manifest as cancelled', async () => {
    const statements: RecordedStatement[] = []
    const { database } = createRecordingDatabase({ statements })

    await new DrizzleMdfeIssuanceWriteBackRepository(database).recordCancelled(CANCELLED_INPUT)

    const tables = statements.map((statement) => statement.table)
    expect(tables.indexOf(MANIFEST_ITEMS_TABLE)).toBeGreaterThan(
      tables.indexOf('mdfe_issuance_attempts'),
    )
    expect(tables.indexOf(MANIFEST_ITEMS_TABLE)).toBeLessThan(tables.indexOf('mdfe_manifests'))
  })

  test('keeps the CT-e manifested when SEFAZ refuses the cancellation', async () => {
    const statements: RecordedStatement[] = []
    const { database } = createRecordingDatabase({ statements })

    await new DrizzleMdfeIssuanceWriteBackRepository(database).recordCancellationRejected({
      attemptId: ATTEMPT_ID,
      companyId: COMPANY_ID,
      errorCode: '573',
      manifestId: MANIFEST_ID,
      occurredAt: OCCURRED_AT,
    })

    expect(findItemRelease(statements)).toBeUndefined()
  })

  test('releases nothing when the attempt was already settled by an earlier delivery', async () => {
    const statements: RecordedStatement[] = []
    const { database } = createRecordingDatabase({ settledAttempt: true, statements })

    await new DrizzleMdfeIssuanceWriteBackRepository(database).recordCancelled(CANCELLED_INPUT)

    expect(findItemRelease(statements)).toBeUndefined()
    expect(statements.map((statement) => statement.table)).toEqual([ATTEMPTS_TABLE])
  })
})

describe('MDF-e rejection write-back contract', () => {
  test('persists the SEFAZ message beside the rejection code', async () => {
    const statements: RecordedStatement[] = []
    const { database } = createRecordingDatabase({ statements })

    await new DrizzleMdfeIssuanceWriteBackRepository(database).recordRejected(REJECTED_INPUT)

    expect(findStatement(statements, ATTEMPTS_TABLE).values).toMatchObject({
      lastErrorCode: REJECTION_CODE,
      lastErrorMessage: REJECTION_MESSAGE,
      status: 'rejected',
    })
  })

  test('keeps the message in the issuance event so the history explains the refusal', async () => {
    const statements: RecordedStatement[] = []
    const { database } = createRecordingDatabase({ statements })

    await new DrizzleMdfeIssuanceWriteBackRepository(database).recordRejected(REJECTED_INPUT)

    expect(findStatement(statements, ISSUANCE_EVENTS_TABLE).values).toMatchObject({
      eventName: 'rejected',
      payload: { errorCode: REJECTION_CODE, errorMessage: REJECTION_MESSAGE },
    })
  })

  test('leaves the stored message untouched when SEFAZ refuses without one', async () => {
    const statements: RecordedStatement[] = []
    const { database } = createRecordingDatabase({ statements })

    await new DrizzleMdfeIssuanceWriteBackRepository(database).recordRejected({
      attemptId: ATTEMPT_ID,
      companyId: COMPANY_ID,
      errorCode: REJECTION_CODE,
      manifestId: MANIFEST_ID,
      occurredAt: OCCURRED_AT,
    })

    expect(findStatement(statements, ATTEMPTS_TABLE).columns).not.toContain('lastErrorMessage')
  })

  test('records the message of a refused cancellation as well', async () => {
    const statements: RecordedStatement[] = []
    const { database } = createRecordingDatabase({ statements })

    await new DrizzleMdfeIssuanceWriteBackRepository(database).recordCancellationRejected({
      ...REJECTED_INPUT,
      errorCode: '573',
      errorMessage: 'Rejeicao: Duplicidade de evento',
    })

    expect(findStatement(statements, ATTEMPTS_TABLE).values).toMatchObject({
      lastErrorCode: '573',
      lastErrorMessage: 'Rejeicao: Duplicidade de evento',
    })
  })
})
