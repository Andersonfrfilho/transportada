/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T014 — duas execuções da rotina não retomam o mesmo pedido ao mesmo tempo. Quem garante é
 * a linha de `job_executions`, não a rotina: (1) só existe uma execução aberta por rotina, pelo índice
 * único parcial da API; e (2) a mesma execução entregue duas vezes é reivindicada uma vez só, pela
 * escrita condicional do lease. Com as duas, a retomada do `confirming` corre em série.
 */
import { describe, expect, test } from 'bun:test'

import type {
  ClaimJobExecutionParams,
  ClaimedJobExecution,
  JobExecutionPort,
} from '../../src/job-run/application/job-execution.port.js'
import { createJobCycle } from '../../src/job-run/application/run-job-cycle.js'
import { createWhatsAppCommandSettlementRoutine } from '../../src/whatsapp-command-settlement/application/whatsapp-command-settlement.routine.js'

const API_JOB_SCHEMA = new URL(
  '../../../api-transportada/src/database/job-schedule.schema.ts',
  import.meta.url,
)
const NOW = new Date('2026-09-12T12:00:00.000Z')
const EXECUTION_ID = '00000000-0000-4000-8000-000000001901'
const REQUEST_ID = '00000000-0000-4000-8000-000000001902'

/** O mesmo `where` do repositório: aberta, e sem lease vivo. Quem grava o lease ganhou. */
function conditionalClaimPort(): JobExecutionPort & { readonly finished: string[] } {
  let leaseExpiresAt: Date | undefined
  let finishedAt: Date | undefined
  const finished: string[] = []
  return {
    async claim(params: ClaimJobExecutionParams): Promise<ClaimedJobExecution | undefined> {
      if (finishedAt !== undefined) return undefined
      if (leaseExpiresAt !== undefined && leaseExpiresAt > params.now) return undefined
      leaseExpiresAt = params.leaseExpiresAt
      return { job: 'whatsapp.command.settle', origin: 'schedule' }
    },
    async finish(params) {
      finishedAt = params.finishedAt
      finished.push(params.outcome)
    },
    finished,
    async renew() {
      return { cancelRequestedAt: undefined }
    },
  }
}

describe('a retomada corre em série (spec 144 T014)', () => {
  test('o schema da API declara uma só execução aberta por rotina', async () => {
    const source = await Bun.file(API_JOB_SCHEMA).text()
    expect(source).toContain("uniqueIndex('job_executions_open_unique')")
    const block = source.slice(source.indexOf("uniqueIndex('job_executions_open_unique')"))
    expect(block.slice(0, 200)).toContain('.on(table.job)')
    expect(block.slice(0, 200)).toContain('finishedAt')
  })

  test('a mesma execução entregue duas vezes retoma o pedido uma vez só', async () => {
    const resumed: string[] = []
    const routine = createWhatsAppCommandSettlementRoutine({
      api: {
        async settle(input) {
          resumed.push(input.requestId)
          await new Promise((resolve) => setTimeout(resolve, 5))
          return { message: undefined, outcome: 'resumed' }
        },
      },
      candidates: {
        async listCandidates() {
          return [
            {
              actorUserId: '00000000-0000-4000-8000-000000001903',
              companyId: '00000000-0000-4000-8000-000000001904',
              confirmedAt: new Date(NOW.getTime() - 20 * 60_000),
              documents: [],
              id: REQUEST_ID,
              status: 'confirming',
            },
          ]
        },
      },
      logger: { error() {}, info() {}, warn() {} },
      now: () => NOW,
      recipients: { findVerifiedPhone: async () => undefined },
      sender: { sendText: async () => undefined },
    })
    const executions = conditionalClaimPort()
    const cycle = createJobCycle({
      executions,
      logger: { error() {}, info() {}, warn() {} },
      now: () => NOW,
      routines: { 'whatsapp.command.settle': routine },
      scheduleInterval: () => () => undefined,
    })
    const envelope = {
      correlationId: 'corr-t014-serial',
      payload: { executionId: EXECUTION_ID },
    } as Parameters<typeof cycle.run>[0]['envelope']

    const results = await Promise.all([cycle.run({ envelope }), cycle.run({ envelope })])

    expect(results.map((result) => result.claimed).toSorted()).toEqual([false, true])
    expect(resumed).toEqual([REQUEST_ID])
    expect(executions.finished).toEqual(['succeeded'])
  })
})
