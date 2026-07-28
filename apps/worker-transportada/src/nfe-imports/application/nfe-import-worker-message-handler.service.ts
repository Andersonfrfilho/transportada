/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqDisposition } from '@adatechnology/rabbitmq-provider'

import type { NfeProcessingEnvelopeV1 } from '../../messaging/nfe-processing-envelope.schema.js'
import { calculateNfePersistentBackoff } from '../../messaging/nfe-backoff-policy.js'

type NfeImportWorkerClock = {
  now(): Date
}

export type NfeImportWorkerEffect = {
  execute(params: { readonly envelope: NfeProcessingEnvelopeV1 }): Promise<unknown>
}

export type NfeImportMessageKey = {
  readonly companyId: string
  readonly eventId: string
  readonly importId: string
}

export type NfeImportWorkerRepository = {
  hasProcessed(params: NfeImportMessageKey): Promise<boolean>
  markDeadLettered(params: NfeImportMessageKey & { readonly reason: string }): Promise<void>
  markProcessed(params: NfeImportMessageKey): Promise<void>
  scheduleRetry(
    params: NfeImportMessageKey & { readonly attempt: number; readonly nextAttemptAt: Date },
  ): Promise<void>
}

export class NfeImportRecoverableError extends Error {
  override readonly name = 'NfeImportRecoverableError'
}

export class NfeImportFatalError extends Error {
  override readonly name = 'NfeImportFatalError'
}

export class NfeImportWorkerMessageHandler {
  readonly #clock: NfeImportWorkerClock
  readonly #effect: NfeImportWorkerEffect
  readonly #maxAttempts: number
  readonly #repository: NfeImportWorkerRepository

  constructor(params: {
    readonly clock: NfeImportWorkerClock
    readonly effect: NfeImportWorkerEffect
    readonly maxAttempts: number
    readonly repository: NfeImportWorkerRepository
  }) {
    this.#clock = params.clock
    this.#effect = params.effect
    this.#maxAttempts = params.maxAttempts
    this.#repository = params.repository
  }

  async handle(params: {
    readonly attempt: number
    readonly envelope: NfeProcessingEnvelopeV1
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
      if (error instanceof NfeImportFatalError) {
        await this.#repository.markDeadLettered({ ...messageKey, reason: error.message })

        return { type: 'dead-letter' }
      }

      return this.#handleRecoverableError({
        attempt: params.attempt,
        messageKey,
        reason: resolveReason(error),
      })
    }
  }

  async #handleRecoverableError(params: {
    readonly attempt: number
    readonly messageKey: NfeImportMessageKey
    readonly reason: string
  }): Promise<RabbitMqDisposition> {
    if (params.attempt >= this.#maxAttempts) {
      await this.#repository.markDeadLettered({
        ...params.messageKey,
        reason: params.reason,
      })

      return { type: 'dead-letter' }
    }

    const backoff = calculateNfePersistentBackoff({
      attempt: params.attempt,
      now: this.#clock.now(),
    })
    await this.#repository.scheduleRetry({
      ...params.messageKey,
      attempt: backoff.attempt,
      nextAttemptAt: backoff.nextAttemptAt,
    })

    return { type: 'retry' }
  }
}

function createMessageKey(envelope: NfeProcessingEnvelopeV1): NfeImportMessageKey {
  return {
    companyId: envelope.companyId,
    eventId: envelope.eventId,
    importId: envelope.payload.importId,
  }
}

function resolveReason(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message
  }

  return 'NFE_IMPORT_PROCESSING_FAILED'
}
