/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { DrizzleCteBatchRepository } from '../../src/cte-batches/infrastructure/drizzle-cte-batch.repository.js'
import { ApiError } from '../../src/shared/api.error.js'

type RepositoryDatabase = ConstructorParameters<typeof DrizzleCteBatchRepository>[0]

const NAME_CONSTRAINT = 'cte_batches_company_id_name_unique'
const IDEMPOTENCY_CONSTRAINT = 'cte_batches_company_id_idempotency_key_unique'
const UNIQUE_VIOLATION = '23505'
const FOREIGN_KEY_VIOLATION = '23503'

const BATCH_INPUT = {
  companyId: '00000000-0000-4000-8000-000000000001',
  correlationId: '00000000-0000-4000-8000-0000000000c1',
  idempotencyFingerprint: 'fingerprint',
  idempotencyKey: '00000000-0000-4000-8000-0000000000d1',
  name: 'Lote de teste',
  operatorUserId: '00000000-0000-4000-8000-0000000000e1',
} as const

/** Mimics the real chain: DrizzleQueryError wrapping the driver PostgresError. */
function buildDriverError(input: {
  readonly constraint: string
  readonly sqlState: string
}): Error {
  const driverError = Object.assign(new Error('duplicate key value violates unique constraint'), {
    constraint: input.constraint,
    errno: input.sqlState,
  })
  return new Error('Failed query: insert into "cte_batches"', { cause: driverError })
}

function buildRepository(error: unknown): DrizzleCteBatchRepository {
  const database = {
    insert: () => ({
      values: () => ({
        returning: () => Promise.reject(error),
      }),
    }),
  }
  return new DrizzleCteBatchRepository(database as unknown as RepositoryDatabase)
}

async function captureError(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation()
    return null
  } catch (error) {
    return error
  }
}

describe('CT-e batch creation name conflict contract', () => {
  test('translates the batch name unique violation into a 409 domain error', async () => {
    const repository = buildRepository(
      buildDriverError({ constraint: NAME_CONSTRAINT, sqlState: UNIQUE_VIOLATION }),
    )

    const error = await captureError(() => repository.createBatch({ ...BATCH_INPUT }))

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('CTE_BATCH_NAME_TAKEN')
    expect((error as ApiError).status).toBe(409)
  })

  test('rethrows a unique violation of another constraint untouched', async () => {
    const driverError = buildDriverError({
      constraint: IDEMPOTENCY_CONSTRAINT,
      sqlState: UNIQUE_VIOLATION,
    })
    const repository = buildRepository(driverError)

    const error = await captureError(() => repository.createBatch({ ...BATCH_INPUT }))

    expect(error).toBe(driverError)
  })

  test('rethrows the name constraint under another sql state untouched', async () => {
    const driverError = buildDriverError({
      constraint: NAME_CONSTRAINT,
      sqlState: FOREIGN_KEY_VIOLATION,
    })
    const repository = buildRepository(driverError)

    const error = await captureError(() => repository.createBatch({ ...BATCH_INPUT }))

    expect(error).toBe(driverError)
  })

  test('rethrows an error that carries no postgres details untouched', async () => {
    const plainError = new Error('connection terminated')
    const repository = buildRepository(plainError)

    const error = await captureError(() => repository.createBatch({ ...BATCH_INPUT }))

    expect(error).toBe(plainError)
  })
})
