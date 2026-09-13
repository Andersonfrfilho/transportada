/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import {
  buildCargoLayoutClaimCondition,
  createDrizzleCargoLayoutRepository,
} from '../../src/cargo-layout/infrastructure/drizzle-cargo-layout.repository.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const JOB = {
  companyId: '00000000-0000-4000-8000-000000000001',
  correlationId: 'correlation-1',
  inputHash: 'c'.repeat(64),
  layoutId: '00000000-0000-4000-8000-000000000002',
} as const

const LEASE_MS = 280_000
const dialect = new PgDialect()

type RecordedUpdate = {
  readonly params: readonly unknown[]
  readonly sql: string
  readonly values: Record<string, unknown>
}

/** Grava cada `UPDATE` em vez de falar com o Postgres — o assunto aqui é a cláusula. */
function createRecordingDatabase(input: {
  readonly returned: readonly unknown[]
  readonly updates: RecordedUpdate[]
}): Database {
  return {
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: SQL) => {
          const query = dialect.sqlToQuery(condition)
          input.updates.push({ params: query.params, sql: query.sql, values })
          return Object.assign(Promise.resolve(undefined), {
            returning: async () => input.returned,
          })
        },
      }),
    }),
  } as unknown as Database
}

describe('repositório da planta de carga (spec 145 D8, D14)', () => {
  test('a reivindicação aceita queued, ou running com lease vencido, sempre por empresa, id e hash', () => {
    const query = dialect.sqlToQuery(
      buildCargoLayoutClaimCondition({ job: JOB, leaseMs: LEASE_MS }) as SQL,
    )

    expect(query.sql).toContain('("trip_cargo_layouts"."company_id" = $1)')
    expect(query.sql).toContain('("trip_cargo_layouts"."id" = $2)')
    expect(query.sql).toContain('("trip_cargo_layouts"."input_hash" = $3)')
    expect(query.sql).toContain(
      '(("trip_cargo_layouts"."status" = $4) or ((("trip_cargo_layouts"."status" = $5) and ("trip_cargo_layouts"."updated_at" < now() - ($6 * interval \'1 millisecond\')))))',
    )
    expect(query.params).toEqual([
      JOB.companyId,
      JOB.layoutId,
      JOB.inputHash,
      'queued',
      'running',
      LEASE_MS,
    ])
  })

  test('claim soma a tentativa, marca running e devolve a entrada', async () => {
    const updates: RecordedUpdate[] = []
    const repository = createDrizzleCargoLayoutRepository({
      database: createRecordingDatabase({
        returned: [{ attempt: 2, input: { stops: [] } }],
        updates,
      }),
      leaseMs: LEASE_MS,
    })

    expect(await repository.claim(JOB)).toEqual({ attempt: 2, input: { stops: [] } })
    expect(updates[0]?.values.status).toBe('running')
    expect(dialect.sqlToQuery(updates[0]?.values.attempt as SQL).sql).toBe(
      '"trip_cargo_layouts"."attempt" + 1',
    )
    expect(updates[0]?.sql).toContain('now() - ')
  })

  test('claim sem linha devolvida é nulo', async () => {
    const repository = createDrizzleCargoLayoutRepository({
      database: createRecordingDatabase({ returned: [], updates: [] }),
      leaseMs: LEASE_MS,
    })

    expect(await repository.claim(JOB)).toBeNull()
  })

  test('complete, fail e release só mexem em running, da mesma empresa, id e hash', async () => {
    const updates: RecordedUpdate[] = []
    const repository = createDrizzleCargoLayoutRepository({
      database: createRecordingDatabase({ returned: [], updates }),
      leaseMs: LEASE_MS,
    })
    const computedAt = new Date('2026-09-12T12:00:00.000Z')

    await repository.complete({
      computedAt,
      durationMs: 1_250,
      job: JOB,
      layout: { rows: [] } as never,
    })
    await repository.fail({ errorCode: 'CARGO_LAYOUT_FAILED', job: JOB })
    await repository.release(JOB)

    for (const update of updates) {
      expect(update.sql).toBe(
        '(("trip_cargo_layouts"."company_id" = $1) and ("trip_cargo_layouts"."id" = $2) and ("trip_cargo_layouts"."input_hash" = $3) and ("trip_cargo_layouts"."status" = $4))',
      )
      expect(update.params).toEqual([JOB.companyId, JOB.layoutId, JOB.inputHash, 'running'])
    }
    expect(updates.map((update) => update.values.status)).toEqual(['ready', 'failed', 'queued'])
    expect(updates[0]?.values).toMatchObject({
      computedAt,
      durationMs: 1_250,
      errorCode: '',
      layout: { rows: [] },
    })
    /** O CHECK da API: `failed` exige código e proíbe planta. */
    expect(updates[1]?.values).toMatchObject({ errorCode: 'CARGO_LAYOUT_FAILED', layout: null })
  })
})
