/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqDisposition } from '@adatechnology/rabbitmq-provider'

import type { CteProcessingEnvelopeV1 } from '../../messaging/cte-processing-envelope.schema.js'
import {
  calculateCteRetryNextAttemptAt,
  isCteRetryExhausted,
  type CteRetryPolicy,
} from '../domain/cte-retry.policy.js'

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
  readonly #retryPolicyResolver: CteRetryPolicyResolver
  readonly #repository: CteIssuanceWorkerRepository

  constructor(params: {
    readonly clock: CteIssuanceWorkerClock
    readonly effect: CteIssuanceWorkerEffect
    readonly retryPolicyResolver: CteRetryPolicyResolver
    readonly repository: CteIssuanceWorkerRepository
  }) {
    this.#clock = params.clock
    this.#effect = params.effect
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

      throw error
    }
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
