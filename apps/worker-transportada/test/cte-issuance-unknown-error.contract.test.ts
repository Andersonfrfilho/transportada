/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { CteIssuanceWorkerMessageHandler } from '../src/cte-issuance/application/cte-issuance-worker-message-handler.service.js'
import {
  isSettledCteIssuanceStatus,
  resolveCteBatchStatus,
} from '../src/cte-issuance/domain/cte-batch-progress.policy.js'
import { createCteRetryPolicy } from '../src/cte-issuance/domain/cte-retry.policy.js'
import {
  CTE_UNKNOWN_ERROR_CAUSE_PREFIX,
  describeCteUnknownError,
} from '../src/cte-issuance/domain/cte-unknown-error.policy.js'
import type { CteProcessingEnvelopeV1 } from '../src/messaging/cte-processing-envelope.schema.js'
import type { WorkerLogger } from '../src/shared/worker.types.js'

const NOW = new Date('2026-08-06T03:00:00.000Z')

const ENVELOPE: CteProcessingEnvelopeV1 = {
  actorId: '94127a9d-22c9-4df0-805f-7654290e251a',
  companyId: 'fbc033e7-63e0-4698-adc6-12778bedf4a7',
  correlationId: 'unknown-error-contract',
  eventId: '2cb3a13d-1c71-47df-9406-1a297e752e10',
  occurredAt: '2026-08-06T02:59:00.000Z',
  payload: {
    attemptFingerprint: 'ctefingerprint-unknown',
    attemptId: '4f6f2e89-bf9b-4d16-b7e7-d8ce6b0f6f5d',
    attemptKind: 'issue',
    batchId: 'd2f4ef6d-4f5d-45af-a9b0-bf4e0f8f8d4d',
    batchItemId: '8a7d8b98-ff3e-4f5f-9967-57fdb2e7e2d8',
    status: 'requested',
  },
  type: 'transportada.cte.item.issue.requested',
  version: 1,
}

/**
 * Três CT-es ficaram "Transmitindo" por mais de uma hora em staging: o efeito lançou um erro que
 * não era recuperável nem fatal, o handler relançou, e a tentativa nunca saiu de `in_flight`.
 */
describe('Erro desconhecido na emissão de CT-e', () => {
  it('não relança: devolve descarte e tira a tentativa de in_flight', async () => {
    const calls: string[] = []
    const handler = createHandler({
      calls,
      failure: databaseFailure(),
      logs: [],
    })

    const disposition = await handler.handle({ attempt: 0, envelope: ENVELOPE })

    expect(disposition).toEqual({ type: 'dead-letter' })
    expect(calls).toEqual([
      `hasProcessed:${messageKey()}`,
      'effect.execute',
      `markReconciliationRequired:${messageKey()}:${CTE_UNKNOWN_ERROR_CAUSE_PREFIX}:DatabaseError: Connection terminated unexpectedly`,
    ])
  })

  it('registra o envelope inteiro e a cadeia do erro para reproduzir a falha', async () => {
    const logs: LogEntry[] = []
    const handler = createHandler({ calls: [], failure: databaseFailure(), logs })

    await handler.handle({ attempt: 2, envelope: ENVELOPE })

    const entry = logs.find((log) => log.message === 'cte_issuance_worker_unexpected_error')
    expect(entry?.level).toBe('error')
    expect(entry?.metadata).toMatchObject({
      attemptFingerprint: ENVELOPE.payload.attemptFingerprint,
      attemptId: ENVELOPE.payload.attemptId,
      attemptKind: ENVELOPE.payload.attemptKind,
      batchId: ENVELOPE.payload.batchId,
      batchItemId: ENVELOPE.payload.batchItemId,
      companyId: ENVELOPE.companyId,
      correlationId: ENVELOPE.correlationId,
      deliveryAttempt: 2,
      envelopeType: ENVELOPE.type,
      envelopeVersion: ENVELOPE.version,
      errorMessage: 'Connection terminated unexpectedly',
      errorName: 'DatabaseError',
      occurredAt: ENVELOPE.occurredAt,
      payloadStatus: 'requested',
    })
    expect(entry?.metadata?.errorCauses).toEqual(['Error: socket hang up'])
    expect(String(entry?.metadata?.errorStack)).toContain('DatabaseError')
  })

  it('nunca leva certificado, senha nem XML assinado para o log', () => {
    const description = describeCteUnknownError(
      new Error(
        'falha ao assinar {"certificadoSenha":"segredo-do-pfx"} <Signature><X509Certificate>MIIEow</X509Certificate></Signature>',
      ),
    )

    expect(description.errorMessage).not.toContain('segredo-do-pfx')
    expect(description.errorMessage).not.toContain('MIIEow')
    expect(description.errorMessage).toContain('[REDACTED]')
  })

  it('mantém a causa persistida curta o bastante para caber na trilha do item', () => {
    const description = describeCteUnknownError(new Error('x'.repeat(4000)))

    expect(description.cause.startsWith(`${CTE_UNKNOWN_ERROR_CAUSE_PREFIX}:Error: `)).toBe(true)
    expect(description.cause.length).toBeLessThanOrEqual(500)
  })

  it('descreve valor lançado que não é Error sem quebrar', () => {
    const description = describeCteUnknownError('boom')

    expect(description.errorName).toBe('UnknownError')
    expect(description.errorMessage).toBe('boom')
    expect(description.errorStack).toBeUndefined()
  })

  // O item preso em `in_flight` mantinha o lote inteiro em `in_flight`, e por isso o botão
  // "Emitir" respondia 409 — o status de conciliação é o que devolve o lote ao operador.
  it('destrava o lote: conciliação pendente é status liquidado', () => {
    expect(isSettledCteIssuanceStatus('reconciliation_required')).toBe(true)
    expect(resolveCteBatchStatus(['authorized', 'reconciliation_required'])).toBe('error')
  })
})

type LogEntry = {
  readonly level: 'error' | 'info' | 'warn'
  readonly message: string
  readonly metadata?: Record<string, unknown>
}

function databaseFailure(): Error {
  const failure = new Error('Connection terminated unexpectedly', {
    cause: new Error('socket hang up'),
  })
  failure.name = 'DatabaseError'

  return failure
}

function createHandler(params: {
  readonly calls: string[]
  readonly failure: unknown
  readonly logs: LogEntry[]
}): CteIssuanceWorkerMessageHandler {
  return new CteIssuanceWorkerMessageHandler({
    clock: { now: () => NOW },
    effect: {
      async execute() {
        params.calls.push('effect.execute')
        throw params.failure
      },
    },
    logger: createLogger(params.logs),
    repository: createRepository(params.calls),
    retryPolicyResolver: {
      async resolve() {
        return createCteRetryPolicy({})
      },
    },
  })
}

function createLogger(logs: LogEntry[]): WorkerLogger {
  return {
    error(message, metadata) {
      logs.push({ level: 'error', message, ...(metadata === undefined ? {} : { metadata }) })
    },
    info(message, metadata) {
      logs.push({ level: 'info', message, ...(metadata === undefined ? {} : { metadata }) })
    },
    warn(message, metadata) {
      logs.push({ level: 'warn', message, ...(metadata === undefined ? {} : { metadata }) })
    },
  }
}

function createRepository(calls: string[]) {
  return {
    async hasProcessed(): Promise<boolean> {
      calls.push(`hasProcessed:${messageKey()}`)

      return false
    },
    async markDeadLettered(input: { readonly reason: string }): Promise<void> {
      calls.push(`markDeadLettered:${messageKey()}:${input.reason}`)
    },
    async markProcessed(): Promise<void> {
      calls.push(`markProcessed:${messageKey()}`)
    },
    async markReconciliationRequired(input: { readonly reason: string }): Promise<void> {
      calls.push(`markReconciliationRequired:${messageKey()}:${input.reason}`)
    },
    async scheduleRetry(input: { readonly attempt: number }): Promise<void> {
      calls.push(`scheduleRetry:${messageKey()}:${input.attempt}`)
    },
  }
}

function messageKey(): string {
  return `${ENVELOPE.companyId}:${ENVELOPE.payload.batchItemId}:${ENVELOPE.payload.attemptId}:${ENVELOPE.eventId}`
}
