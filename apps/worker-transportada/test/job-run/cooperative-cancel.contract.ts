/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  JobRoutineContext,
  JobRoutineResult,
} from '../../src/job-run/application/job-routine.port.js'
import { runJobCycle } from '../../src/job-run/application/run-job-cycle.js'
import type { JobRunEnvelopeV1 } from '../../src/messaging/job-run-envelope.schema.js'

import {
  createExecutionDouble,
  createLoggerDouble,
  createManualScheduler,
  type ExecutionDouble,
  type LoggedMessage,
  type ManualScheduler,
} from './job-run.double.js'

const EXECUTION_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const NOW = new Date('2026-08-23T09:00:00.000Z')
const CANCEL_REQUESTED_AT = new Date('2026-08-23T09:00:07.000Z')

const ENVELOPE: JobRunEnvelopeV1 = {
  correlationId: 'tick-2026-08-23T09:00:00.000Z',
  eventId: '0f7c4a3e-9b1d-4e2f-8a5c-6d7e8f9a0b1c',
  occurredAt: '2026-08-23T09:00:00.000Z',
  payload: { executionId: EXECUTION_ID, job: 'fuel.price.pull', origin: 'schedule' },
  type: 'transportada.job.run.requested',
  version: 1,
}

type UnitRoutineParams = {
  readonly executions: ExecutionDouble
  /** O tique do batimento que cai entre a unidade `cancelAfter` e a seguinte. */
  readonly cancelAfter: number
  readonly outcome: string
  readonly scheduler: ManualScheduler
  readonly units: readonly string[]
}

/**
 * Uma rotina de mentira com o formato das de verdade: um laço por unidade, com a leitura da parada
 * **no limite** e o contador do que foi gravado. É esse formato que a spec cobra das quatro.
 */
function createUnitRoutine(params: UnitRoutineParams) {
  const written: string[] = []

  return {
    written,
    routine: {
      run: async (context: JobRoutineContext): Promise<JobRoutineResult> => {
        for (const [index, unit] of params.units.entries()) {
          if (context.isStopRequested()) break

          written.push(unit)

          if (index === params.cancelAfter) {
            params.executions.row.cancelRequestedAt = CANCEL_REQUESTED_AT
            await params.scheduler.beat()
          }
        }

        return {
          counters: { statesWritten: written.length },
          outcome: params.outcome as never,
        }
      },
    },
  }
}

type RunParams = {
  readonly cancelAfter: number
  readonly outcome?: string
}

async function runWithCancel({ cancelAfter, outcome = 'succeeded' }: RunParams) {
  const executions = createExecutionDouble()
  const scheduler = createManualScheduler()
  const logged: LoggedMessage[] = []
  const { routine, written } = createUnitRoutine({
    cancelAfter,
    executions,
    outcome,
    scheduler,
    units: ['SP', 'MG', 'RJ', 'BA'],
  })

  const result = await runJobCycle({
    dependencies: {
      executions,
      logger: createLoggerDouble(logged),
      now: () => NOW,
      routines: { 'fuel.price.pull': routine },
      scheduleInterval: scheduler.scheduler,
    },
    envelope: ENVELOPE,
  })

  return { executions, logged, result, written }
}

describe('job run cooperative cancel', () => {
  test('para no limite da unidade, e o que já foi gravado permanece', async () => {
    const { executions, result, written } = await runWithCancel({ cancelAfter: 1 })

    expect(written).toEqual(['SP', 'MG'])
    expect(result.outcome).toBe('cancelled')
    expect(executions.row.outcome).toBe('cancelled')
    expect(executions.row.counters).toEqual({ statesWritten: 2 })
    expect(executions.row.finishedAt).toEqual(NOW)
    // O CHECK de lease recusa linha fechada segurando prazo; a varredura não a vê mais.
    expect(executions.row.leaseExpiresAt).toBeUndefined()
  })

  test('a parada substitui o "terminou", não a unidade que ficou pela metade', async () => {
    const { written } = await runWithCancel({ cancelAfter: 0 })

    // A unidade que já tinha começado terminou; a parada só impediu a próxima.
    expect(written).toEqual(['SP'])
  })

  test('parada não apaga falha: o motivo da rotina vence o cancelamento', async () => {
    const { executions, result } = await runWithCancel({
      cancelAfter: 1,
      outcome: 'anp_unreachable',
    })

    expect(result.outcome).toBe('anp_unreachable')
    expect(executions.row.outcome).toBe('anp_unreachable')
  })

  test('código fora do vocabulário continua virando unexpected_error mesmo com parada pedida', async () => {
    const { executions } = await runWithCancel({
      cancelAfter: 1,
      outcome: 'provider_unreachable',
    })

    expect(executions.row.outcome).toBe('unexpected_error')
    expect(executions.row.counters).toEqual({ statesWritten: 2 })
  })

  test('sem pedido de parada a rotina corre inteira e fecha em succeeded', async () => {
    const { executions, logged, result, written } = await runWithCancel({ cancelAfter: 99 })

    expect(written).toEqual(['SP', 'MG', 'RJ', 'BA'])
    expect(result.outcome).toBe('succeeded')
    expect(executions.row.outcome).toBe('succeeded')
    expect(logged.some((entry) => entry.message === 'job_run_cycle_cancelled')).toBe(false)
  })

  test('a parada é lida da linha do banco, no batimento, e não do envelope', async () => {
    const { executions, logged } = await runWithCancel({ cancelAfter: 1 })

    expect(logged.some((entry) => entry.message === 'job_run_cycle_cancelled')).toBe(true)
    // Uma ida ao banco por batimento, e ela traz o prazo novo e o pedido de parada juntos.
    expect(executions.renewals).toHaveLength(1)
    expect(executions.renewals[0]?.expectedLeaseExpiresAt).toEqual(new Date(NOW.getTime() + 30_000))
  })
})
