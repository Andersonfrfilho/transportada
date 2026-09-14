/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, lt, or, sql, type SQL } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { tripCargoLayouts } from '../../database/trip-cargo-layout.schema.js'
import type {
  CargoLayoutHandlerPorts,
  CargoLayoutJob,
} from '../application/cargo-layout-handler.service.js'
import { CARGO_LAYOUT_STATUS } from './cargo-layout-status.constant.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type CargoLayoutRepository = Pick<
  CargoLayoutHandlerPorts,
  'claim' | 'complete' | 'fail' | 'release'
>

/**
 * A reivindicação é a idempotência (spec 145 D8): dois consumidores com a mesma mensagem só
 * trabalham se um vencer aqui. O hash no `where` descarta pedido superado; `running` com lease vencido
 * é worker que morreu no meio (D14) — sem isso a planta ficaria "calculando" para sempre.
 */
export function buildCargoLayoutClaimCondition(input: {
  readonly job: CargoLayoutJob
  readonly leaseMs: number
}): SQL | undefined {
  return and(
    eq(tripCargoLayouts.companyId, input.job.companyId),
    eq(tripCargoLayouts.id, input.job.layoutId),
    eq(tripCargoLayouts.inputHash, input.job.inputHash),
    or(
      eq(tripCargoLayouts.status, CARGO_LAYOUT_STATUS.queued),
      and(
        eq(tripCargoLayouts.status, CARGO_LAYOUT_STATUS.running),
        lt(tripCargoLayouts.updatedAt, sql`now() - (${input.leaseMs} * interval '1 millisecond')`),
      ),
    ),
  )
}

/** Só quem detém a reivindicação escreve: uma planta reaberta pela API não é sobrescrita por mensagem velha. */
function buildRunningCondition(job: CargoLayoutJob): SQL | undefined {
  return and(
    eq(tripCargoLayouts.companyId, job.companyId),
    eq(tripCargoLayouts.id, job.layoutId),
    eq(tripCargoLayouts.inputHash, job.inputHash),
    eq(tripCargoLayouts.status, CARGO_LAYOUT_STATUS.running),
  )
}

export function createDrizzleCargoLayoutRepository(input: {
  readonly database: Database
  readonly leaseMs: number
}): CargoLayoutRepository {
  const { database, leaseMs } = input

  return {
    async claim(job) {
      const [row] = await database
        .update(tripCargoLayouts)
        .set({
          attempt: sql`${tripCargoLayouts.attempt} + 1`,
          status: CARGO_LAYOUT_STATUS.running,
          updatedAt: sql`now()`,
        })
        .where(buildCargoLayoutClaimCondition({ job, leaseMs }))
        .returning({ attempt: tripCargoLayouts.attempt, input: tripCargoLayouts.input })

      return row === undefined ? null : { attempt: row.attempt, input: row.input }
    },

    async complete({ computedAt, durationMs, job, layout }) {
      await database
        .update(tripCargoLayouts)
        .set({
          computedAt,
          durationMs,
          errorCode: '',
          layout,
          status: CARGO_LAYOUT_STATUS.ready,
          updatedAt: sql`now()`,
        })
        .where(buildRunningCondition(job))
    },

    /** O CHECK da API: `failed` exige código e proíbe planta. */
    async fail({ errorCode, job }) {
      await database
        .update(tripCargoLayouts)
        .set({ errorCode, layout: null, status: CARGO_LAYOUT_STATUS.failed, updatedAt: sql`now()` })
        .where(buildRunningCondition(job))
    },

    async release(job) {
      await database
        .update(tripCargoLayouts)
        .set({ status: CARGO_LAYOUT_STATUS.queued, updatedAt: sql`now()` })
        .where(buildRunningCondition(job))
    },
  }
}
