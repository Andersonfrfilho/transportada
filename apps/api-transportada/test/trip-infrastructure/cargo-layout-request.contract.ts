/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

import { tripCargoLayoutOutbox } from '../../src/database/trip-cargo-layout-outbox.schema.js'
import type { StoredCargoLayoutInput } from '../../src/trips/domain/cargo-layout-hash.types.js'
import type { UpsertCargoLayoutRequestParams } from '../../src/trips/application/cargo-layout-request.types.js'
import { upsertCargoLayoutRequest } from '../../src/trips/infrastructure/cargo-layout-request.support.js'
import type { TripTransaction } from '../../src/trips/infrastructure/trip-queryable.type.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const LAYOUT_ID = '00000000-0000-4000-8000-0000000000b1'
const TRIP_ID = '00000000-0000-4000-8000-0000000000a1'

const INPUT: StoredCargoLayoutInput = {
  bedDimensions: null,
  capacityM3: null,
  enclosedBody: false,
  fallbackBoxVolumeM3: null,
  loadingAccess: 'rear',
  measuredShapes: [],
  payloadRatio: null,
  policyVersion: 'cargo-placement-v1',
  securesCargo: false,
  stops: [],
}

const BASE_PARAMS: UpsertCargoLayoutRequestParams = {
  companyId: COMPANY_ID,
  correlationId: 'trace-1',
  input: INPUT,
  inputHash: 'hash-1',
  leaseMs: 280_000,
  policyVersion: 'cargo-placement-v1',
  tripId: TRIP_ID,
}

type ConflictConfig = { readonly set: Record<string, unknown>; readonly where: SQL }

function createTransaction(options: {
  readonly existingRow?: { id: string; status: string; tripId: string | null }
  readonly returning: readonly { id: string; status: string }[]
}): {
  readonly conflicts: ConflictConfig[]
  readonly layoutUpdates: unknown[]
  readonly outboxInserts: unknown[]
  readonly transaction: TripTransaction
  readonly updateConditions: SQL[]
} {
  const outboxInserts: unknown[] = []
  const layoutUpdates: unknown[] = []
  const updateConditions: SQL[] = []
  const conflicts: ConflictConfig[] = []

  const transaction = {
    insert: (table: unknown) => {
      if (table === tripCargoLayoutOutbox) {
        return {
          values: (payload: unknown) => {
            outboxInserts.push(payload)
            return Promise.resolve([])
          },
        }
      }
      return {
        values: () => ({
          onConflictDoUpdate: (config: ConflictConfig) => {
            conflicts.push(config)
            return { returning: () => Promise.resolve(options.returning) }
          },
        }),
      }
    },
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve(options.existingRow === undefined ? [] : [options.existingRow]),
        }),
      }),
    }),
    update: () => ({
      set: (payload: unknown) => {
        layoutUpdates.push(payload)
        return {
          where: (condition: SQL) => {
            updateConditions.push(condition)
            return Promise.resolve()
          },
        }
      },
    }),
  } as unknown as TripTransaction

  return { conflicts, layoutUpdates, outboxInserts, transaction, updateConditions }
}

const dialect = new PgDialect()

describe('cargo layout request upsert-and-outbox contract (spec 145 D8/G006)', () => {
  test('does nothing new when the upsert returns no row, but still answers the caller', async () => {
    const { outboxInserts, transaction } = createTransaction({
      existingRow: { id: LAYOUT_ID, status: 'queued', tripId: TRIP_ID },
      returning: [],
    })

    const result = await upsertCargoLayoutRequest(transaction, BASE_PARAMS)

    expect(result).toEqual({ enqueued: false, layoutId: LAYOUT_ID, status: 'queued' })
    expect(outboxInserts).toHaveLength(0)
  })

  /** Uma linha voltando do upsert — nova ou reaberta — é o único gatilho do outbox. */
  test('enqueues exactly one outbox row when the upsert returns a row', async () => {
    const { outboxInserts, transaction } = createTransaction({
      returning: [{ id: LAYOUT_ID, status: 'queued' }],
    })

    const result = await upsertCargoLayoutRequest(transaction, BASE_PARAMS)

    expect(result).toEqual({ enqueued: true, layoutId: LAYOUT_ID, status: 'queued' })
    expect(outboxInserts).toHaveLength(1)
    expect(outboxInserts[0]).toEqual({
      companyId: COMPANY_ID,
      correlationId: 'trace-1',
      eventType: 'transportada.trip.cargo-layout.requested',
      layoutId: LAYOUT_ID,
      payload: { inputHash: 'hash-1', layoutId: LAYOUT_ID },
    })
  })

  /** D3: a prévia virou viagem real — o pedido antigo aprende o `tripId`, mesmo sem reabrir. */
  test('learns the trip id in the no-op path, when a preview becomes a real trip', async () => {
    const { layoutUpdates, transaction } = createTransaction({
      existingRow: { id: LAYOUT_ID, status: 'ready', tripId: null },
      returning: [],
    })

    const result = await upsertCargoLayoutRequest(transaction, { ...BASE_PARAMS, tripId: TRIP_ID })

    expect(result.enqueued).toBeFalse()
    expect(layoutUpdates).toHaveLength(1)
    expect(layoutUpdates[0]).toMatchObject({ tripId: TRIP_ID })
  })

  /**
   * D14/D16/D18: `failed`, `queued` e `running` só reabrem quando o `updated_at` passou do lease —
   * worker morto no meio, mensagem perdida, ou a espera depois de uma falha. `failed` recente é
   * no-op: reabri-lo a cada leitura repetiria uma falha determinística sem teto. `ready` fica fora.
   */
  test('reopens failed, queued or running rows only past the lease', async () => {
    const { conflicts, transaction } = createTransaction({
      returning: [{ id: LAYOUT_ID, status: 'queued' }],
    })

    await upsertCargoLayoutRequest(transaction, BASE_PARAMS)

    const where = conflicts[0]?.where
    expect(where).toBeDefined()
    const query = dialect.sqlToQuery(where as SQL)
    expect(query.sql).toBe(
      `"trip_cargo_layouts"."status" in ('failed', 'queued', 'running') and "trip_cargo_layouts"."updated_at" < now() - ($1 * interval '1 millisecond')`,
    )
    expect(query.params).toEqual([280_000])
    expect(query.sql).not.toContain('ready')
  })

  test('the lease in the reopen condition is the one the caller injected', async () => {
    const { conflicts, transaction } = createTransaction({
      returning: [{ id: LAYOUT_ID, status: 'queued' }],
    })

    await upsertCargoLayoutRequest(transaction, { ...BASE_PARAMS, leaseMs: 44_000 })

    expect(dialect.sqlToQuery(conflicts[0]?.where as SQL).params).toContain(44_000)
  })

  test('a reopened row goes back to queued, from the first attempt, without the old plan', async () => {
    const { conflicts, transaction } = createTransaction({
      returning: [{ id: LAYOUT_ID, status: 'queued' }],
    })

    await upsertCargoLayoutRequest(transaction, BASE_PARAMS)

    expect(conflicts[0]?.set).toMatchObject({
      attempt: 0,
      errorCode: '',
      layout: null,
      status: 'queued',
    })
  })

  /** D18: `failed` recente não volta do upsert — responde a falha, sem outbox. */
  test('a recent failed row answers without enqueuing', async () => {
    const { outboxInserts, transaction } = createTransaction({
      existingRow: { id: LAYOUT_ID, status: 'failed', tripId: TRIP_ID },
      returning: [],
    })

    const result = await upsertCargoLayoutRequest(transaction, BASE_PARAMS)

    expect(result).toEqual({ enqueued: false, layoutId: LAYOUT_ID, status: 'failed' })
    expect(outboxInserts).toHaveLength(0)
  })

  /**
   * Revisão final (M3): o hash ignora etiqueta, então reabrir com o mesmo hash pode trazer rótulo novo —
   * a linha reaberta precisa empacotar a entrada de agora, não a guardada.
   */
  test('a reopened row rewrites the stored input with the one just requested', async () => {
    const { conflicts, transaction } = createTransaction({
      returning: [{ id: LAYOUT_ID, status: 'queued' }],
    })

    await upsertCargoLayoutRequest(transaction, BASE_PARAMS)

    const input = conflicts[0]?.set['input']
    expect(input).toBeDefined()
    expect(dialect.sqlToQuery(input as SQL).sql).toBe('excluded.input')
  })

  /**
   * M3, caminho no-op: a linha na fila ainda não reivindicada passa a empacotar a etiqueta nova. Sem
   * mexer em status nem em `updated_at` — `updated_at` é o relógio do lease (D14/D18).
   */
  test('the no-op path refreshes only the stored input, without touching status or the lease', async () => {
    const renamed: StoredCargoLayoutInput = {
      ...INPUT,
      stops: [{ documentsWithoutVolume: 0, label: 'Rótulo novo', sequence: 1, volumeM3: null }],
    }
    const { layoutUpdates, outboxInserts, transaction } = createTransaction({
      existingRow: { id: LAYOUT_ID, status: 'queued', tripId: TRIP_ID },
      returning: [],
    })

    await upsertCargoLayoutRequest(transaction, { ...BASE_PARAMS, input: renamed })

    expect(outboxInserts).toHaveLength(0)
    expect(layoutUpdates).toEqual([{ input: renamed }])
  })

  /** L5: o `update` do caminho no-op filtra pela empresa, não só pelo id. */
  test('the no-op update is scoped to the company', async () => {
    const { transaction, updateConditions } = createTransaction({
      existingRow: { id: LAYOUT_ID, status: 'ready', tripId: null },
      returning: [],
    })

    await upsertCargoLayoutRequest(transaction, BASE_PARAMS)

    expect(updateConditions).toHaveLength(1)
    const query = dialect.sqlToQuery(updateConditions[0] as SQL)
    expect(query.sql).toContain('"trip_cargo_layouts"."company_id" = ')
    expect(query.params).toContain(COMPANY_ID)
    expect(query.params).toContain(LAYOUT_ID)
  })

  /** Linha `running` recente (ou `ready`) não volta do upsert: no-op, sem outbox. */
  test('a recent running row answers without enqueuing', async () => {
    const { outboxInserts, transaction } = createTransaction({
      existingRow: { id: LAYOUT_ID, status: 'running', tripId: TRIP_ID },
      returning: [],
    })

    const result = await upsertCargoLayoutRequest(transaction, BASE_PARAMS)

    expect(result).toEqual({ enqueued: false, layoutId: LAYOUT_ID, status: 'running' })
    expect(outboxInserts).toHaveLength(0)
  })
})
