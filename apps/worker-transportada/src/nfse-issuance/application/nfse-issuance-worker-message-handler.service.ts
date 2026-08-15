/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqDisposition } from '@adatechnology/rabbitmq-provider'

import type { NfseProcessingEnvelopeV1 } from '../../messaging/nfse-processing-envelope.schema.js'
import {
  calculateNfseRetryNextAttemptAt,
  isNfseRetryExhausted,
  type NfseRetryPolicy,
} from '../domain/nfse-retry.policy.js'
import type { NfseIssuanceConsumerEffect } from './nfse-issuance-consumer.effect.js'
import { NfseIssuanceFatalError, NfseIssuanceRecoverableError } from './nfse-issuance.error.js'

export type NfseIssuanceMessageKey = {
  readonly attemptId: string
  readonly companyId: string
  readonly eventId: string
  readonly invoiceId: string
}

export type NfseIssuanceWorkerRepository = {
  hasProcessed(params: NfseIssuanceMessageKey): Promise<boolean>
  markDeadLettered(params: NfseIssuanceMessageKey & { readonly reason: string }): Promise<void>
  markProcessed(params: NfseIssuanceMessageKey): Promise<void>
  scheduleRetry(params: NfseIssuanceMessageKey & { readonly nextAttemptAt: Date }): Promise<void>
}

export type NfseRetryPolicyResolver = {
  resolve(input: { readonly companyId: string }): Promise<NfseRetryPolicy>
}

export class NfseIssuanceWorkerMessageHandler {
  readonly #clock: () => Date
  readonly #effect: NfseIssuanceConsumerEffect
  readonly #repository: NfseIssuanceWorkerRepository
  readonly #retryPolicyResolver: NfseRetryPolicyResolver

  constructor(dependencies: {
    readonly clock?: () => Date
    readonly effect: NfseIssuanceConsumerEffect
    readonly repository: NfseIssuanceWorkerRepository
    readonly retryPolicyResolver: NfseRetryPolicyResolver
  }) {
    this.#clock = dependencies.clock ?? ((): Date => new Date())
    this.#effect = dependencies.effect
    this.#repository = dependencies.repository
    this.#retryPolicyResolver = dependencies.retryPolicyResolver
  }

  /**
   * `hasProcessed → efeito → markProcessed`, nessa ordem: marcar antes deixaria uma emissão perdida
   * se o efeito falhasse, e marcar só no fim é o que impede a segunda entrega de emitir de novo.
   */
  async handle(params: {
    readonly attempt: number
    readonly envelope: NfseProcessingEnvelopeV1
  }): Promise<RabbitMqDisposition> {
    const key: NfseIssuanceMessageKey = {
      attemptId: params.envelope.payload.attemptId,
      companyId: params.envelope.companyId,
      eventId: params.envelope.eventId,
      invoiceId: params.envelope.payload.invoiceId,
    }

    if (await this.#repository.hasProcessed(key)) {
      return { type: 'ack' }
    }

    try {
      await this.#effect.execute({ envelope: params.envelope })
    } catch (error: unknown) {
      if (error instanceof NfseIssuanceRecoverableError) {
        return this.#handleRecoverableError({ attempt: params.attempt, error, key })
      }

      if (error instanceof NfseIssuanceFatalError) {
        await this.#repository.markDeadLettered({ ...key, reason: error.message })
        return { type: 'dead-letter' }
      }

      throw error
    }

    await this.#repository.markProcessed(key)

    return { type: 'ack' }
  }

  async #handleRecoverableError(input: {
    readonly attempt: number
    readonly error: NfseIssuanceRecoverableError
    readonly key: NfseIssuanceMessageKey
  }): Promise<RabbitMqDisposition> {
    const policy = await this.#retryPolicyResolver.resolve({ companyId: input.key.companyId })
    const attemptsMade = input.attempt + 1

    if (isNfseRetryExhausted({ attemptsMade, policy })) {
      await this.#repository.markDeadLettered({ ...input.key, reason: input.error.message })
      return { type: 'dead-letter' }
    }

    await this.#repository.scheduleRetry({
      ...input.key,
      nextAttemptAt: calculateNfseRetryNextAttemptAt({ attemptsMade, now: this.#clock(), policy }),
    })

    return { type: 'retry' }
  }
}
