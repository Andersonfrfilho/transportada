/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqDisposition } from '@adatechnology/rabbitmq-provider'

import type { MdfeProcessingEnvelopeV1 } from '../../messaging/mdfe-processing-envelope.schema.js'
import {
  calculateMdfeRetryNextAttemptAt,
  isMdfeRetryExhausted,
  type MdfeRetryPolicy,
} from '../domain/mdfe-retry.policy.js'

type MdfeIssuanceWorkerClock = {
  now(): Date
}

type MdfeIssuanceWorkerEffect = {
  execute(params: { readonly envelope: MdfeProcessingEnvelopeV1 }): Promise<void>
}

type MdfeIssuanceMessageKey = {
  readonly attemptId: string
  readonly companyId: string
  readonly eventId: string
  readonly manifestId: string
}

type MdfeIssuanceWorkerRepository = {
  hasProcessed(params: MdfeIssuanceMessageKey): Promise<boolean>
  markDeadLettered(params: MdfeIssuanceMessageKey & { readonly reason: string }): Promise<void>
  markProcessed(params: MdfeIssuanceMessageKey): Promise<void>
  scheduleRetry(
    params: MdfeIssuanceMessageKey & { readonly attempt: number; readonly nextAttemptAt: Date },
  ): Promise<void>
}

export class MdfeIssuanceRecoverableError extends Error {
  override readonly name = 'MdfeIssuanceRecoverableError'
}

export class MdfeIssuanceFatalError extends Error {
  override readonly name = 'MdfeIssuanceFatalError'
}

export type MdfeRetryPolicyResolver = {
  resolve(params: { readonly companyId: string }): Promise<MdfeRetryPolicy>
}

export class MdfeIssuanceWorkerMessageHandler {
  readonly #clock: MdfeIssuanceWorkerClock
  readonly #effect: MdfeIssuanceWorkerEffect
  readonly #retryPolicyResolver: MdfeRetryPolicyResolver
  readonly #repository: MdfeIssuanceWorkerRepository

  constructor(params: {
    readonly clock: MdfeIssuanceWorkerClock
    readonly effect: MdfeIssuanceWorkerEffect
    readonly retryPolicyResolver: MdfeRetryPolicyResolver
    readonly repository: MdfeIssuanceWorkerRepository
  }) {
    this.#clock = params.clock
    this.#effect = params.effect
    this.#retryPolicyResolver = params.retryPolicyResolver
    this.#repository = params.repository
  }

  async handle(params: {
    readonly attempt: number
    readonly envelope: MdfeProcessingEnvelopeV1
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
      if (error instanceof MdfeIssuanceRecoverableError) {
        return this.#handleRecoverableError({
          attempt: params.attempt,
          messageKey,
          reason: error.message,
        })
      }

      if (error instanceof MdfeIssuanceFatalError) {
        await this.#repository.markDeadLettered({ ...messageKey, reason: error.message })

        return { type: 'dead-letter' }
      }

      throw error
    }
  }

  async #handleRecoverableError(params: {
    readonly attempt: number
    readonly messageKey: MdfeIssuanceMessageKey
    readonly reason: string
  }): Promise<RabbitMqDisposition> {
    const policy = await this.#retryPolicyResolver.resolve({
      companyId: params.messageKey.companyId,
    })
    const attemptsMade = params.attempt + 1
    if (isMdfeRetryExhausted({ attemptsMade, policy })) {
      await this.#repository.markDeadLettered({ ...params.messageKey, reason: params.reason })

      return { type: 'dead-letter' }
    }

    await this.#repository.scheduleRetry({
      ...params.messageKey,
      attempt: attemptsMade,
      nextAttemptAt: calculateMdfeRetryNextAttemptAt({
        attemptsMade,
        now: this.#clock.now(),
        policy,
      }),
    })

    return { type: 'retry' }
  }
}

function createMessageKey(envelope: MdfeProcessingEnvelopeV1): MdfeIssuanceMessageKey {
  return {
    attemptId: envelope.payload.attemptId,
    companyId: envelope.companyId,
    eventId: envelope.eventId,
    manifestId: envelope.payload.manifestId,
  }
}
