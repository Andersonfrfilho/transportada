/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqDisposition } from '@adatechnology/rabbitmq-provider'

import { safeLogError } from '../../logging/safe-logger.service.js'
import type { CteProcessingEnvelopeV1 } from '../../messaging/cte-processing-envelope.schema.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import {
  calculateCteRetryNextAttemptAt,
  isCteRetryExhausted,
  type CteRetryPolicy,
} from '../domain/cte-retry.policy.js'
import { describeCteUnknownError } from '../domain/cte-unknown-error.policy.js'

type CteIssuanceWorkerClock = {
  now(): Date
}

type CteIssuanceWorkerEffect = {
  execute(params: { readonly envelope: CteProcessingEnvelopeV1 }): Promise<void>
}

type CteIssuanceMessageKey = {
  readonly attemptId: string
  readonly batchItemId: string
  readonly companyId: string
  readonly eventId: string
}

type CteIssuanceWorkerRepository = {
  hasProcessed(params: CteIssuanceMessageKey): Promise<boolean>
  markDeadLettered(params: CteIssuanceMessageKey & { readonly reason: string }): Promise<void>
  markProcessed(params: CteIssuanceMessageKey): Promise<void>
  markReconciliationRequired(
    params: CteIssuanceMessageKey & { readonly reason: string },
  ): Promise<void>
  scheduleRetry(
    params: CteIssuanceMessageKey & { readonly attempt: number; readonly nextAttemptAt: Date },
  ): Promise<void>
}

export class CteIssuanceRecoverableError extends Error {
  override readonly name = 'CteIssuanceRecoverableError'
}

export class CteIssuanceFatalError extends Error {
  override readonly name = 'CteIssuanceFatalError'
}

export type CteRetryPolicyResolver = {
  resolve(params: { readonly companyId: string }): Promise<CteRetryPolicy>
}

export class CteIssuanceWorkerMessageHandler {
  readonly #clock: CteIssuanceWorkerClock
  readonly #effect: CteIssuanceWorkerEffect
  readonly #logger: WorkerLogger
  readonly #retryPolicyResolver: CteRetryPolicyResolver
  readonly #repository: CteIssuanceWorkerRepository

  constructor(params: {
    readonly clock: CteIssuanceWorkerClock
    readonly effect: CteIssuanceWorkerEffect
    readonly logger: WorkerLogger
    readonly retryPolicyResolver: CteRetryPolicyResolver
    readonly repository: CteIssuanceWorkerRepository
  }) {
    this.#clock = params.clock
    this.#effect = params.effect
    this.#logger = params.logger
    this.#retryPolicyResolver = params.retryPolicyResolver
    this.#repository = params.repository
  }

  async handle(params: {
    readonly attempt: number
    readonly envelope: CteProcessingEnvelopeV1
  }): Promise<RabbitMqDisposition> {
    const messageKey = createMessageKey(params.envelope)
    if (await this.#repository.hasProcessed(messageKey)) {
      return { type: 'ack' }
    }

    try {
      await this.#effect.execute({ envelope: params.envelope })
      await this.#repository.markProcessed(messageKey)

      return { type: 'ack' }
    } catch (error: unknown) {
      if (error instanceof CteIssuanceRecoverableError) {
        return this.#handleRecoverableError({
          attempt: params.attempt,
          messageKey,
          reason: error.message,
        })
      }

      if (error instanceof CteIssuanceFatalError) {
        await this.#repository.markDeadLettered({ ...messageKey, reason: error.message })

        return { type: 'dead-letter' }
      }

      return this.#handleUnknownError({
        attempt: params.attempt,
        envelope: params.envelope,
        error,
        messageKey,
      })
    }
  }

  /**
   * Relançar deixava a tentativa em `in_flight` para sempre e a mensagem em reentrega infinita —
   * foi assim que três CT-es ficaram "Transmitindo" enquanto a SEFAZ recebia a mesma emissão.
   * O item volta para conciliação: pode ter sido autorizado sem a resposta chegar até nós.
   */
  async #handleUnknownError(params: {
    readonly attempt: number
    readonly envelope: CteProcessingEnvelopeV1
    readonly error: unknown
    readonly messageKey: CteIssuanceMessageKey
  }): Promise<RabbitMqDisposition> {
    const description = describeCteUnknownError(params.error)

    safeLogError({
      logger: this.#logger,
      message: 'cte_issuance_worker_unexpected_error',
      metadata: {
        attemptFingerprint: params.envelope.payload.attemptFingerprint,
        attemptId: params.envelope.payload.attemptId,
        attemptKind: params.envelope.payload.attemptKind,
        batchId: params.envelope.payload.batchId,
        batchItemId: params.envelope.payload.batchItemId,
        cause: description.cause,
        companyId: params.envelope.companyId,
        correlationId: params.envelope.correlationId,
        deliveryAttempt: params.attempt,
        envelopeType: params.envelope.type,
        envelopeVersion: params.envelope.version,
        errorCauses: description.errorCauses,
        errorMessage: description.errorMessage,
        errorName: description.errorName,
        errorStack: description.errorStack,
        eventId: params.envelope.eventId,
        occurredAt: params.envelope.occurredAt,
        payloadStatus: params.envelope.payload.status,
      },
    })

    await this.#repository.markReconciliationRequired({
      ...params.messageKey,
      reason: description.cause,
    })

    return { type: 'dead-letter' }
  }

  async #handleRecoverableError(params: {
    readonly attempt: number
    readonly messageKey: CteIssuanceMessageKey
    readonly reason: string
  }): Promise<RabbitMqDisposition> {
    const policy = await this.#retryPolicyResolver.resolve({
      companyId: params.messageKey.companyId,
    })
    const attemptsMade = params.attempt + 1
    if (isCteRetryExhausted({ attemptsMade, policy })) {
      await this.#repository.markDeadLettered({
        ...params.messageKey,
        reason: params.reason,
      })

      return { type: 'dead-letter' }
    }

    await this.#repository.scheduleRetry({
      ...params.messageKey,
      attempt: attemptsMade,
      nextAttemptAt: calculateCteRetryNextAttemptAt({
        attemptsMade,
        now: this.#clock.now(),
        policy,
      }),
    })

    return { type: 'retry' }
  }
}

function createMessageKey(envelope: CteProcessingEnvelopeV1): CteIssuanceMessageKey {
  return {
    attemptId: envelope.payload.attemptId,
    batchItemId: envelope.payload.batchItemId,
    companyId: envelope.companyId,
    eventId: envelope.eventId,
  }
}
