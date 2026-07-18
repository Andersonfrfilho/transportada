/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqDisposition } from '@adatechnology/rabbitmq-provider'

import type { SyntheticMessageEnvelopeV1 } from './message-envelope.schema.js'

interface WorkerEffect {
  execute(params: { envelope: SyntheticMessageEnvelopeV1 }): Promise<void>
}

interface WorkerIdempotency {
  isProcessed(params: { eventId: string }): Promise<boolean>
  markProcessed(params: { eventId: string }): Promise<void>
}

export class TransientWorkerError extends Error {
  override readonly name = 'TransientWorkerError'
}

export class FatalWorkerError extends Error {
  override readonly name = 'FatalWorkerError'
}

export class WorkerMessageHandler {
  readonly #effect: WorkerEffect
  readonly #idempotency: WorkerIdempotency

  constructor(params: { effect: WorkerEffect; idempotency: WorkerIdempotency }) {
    this.#effect = params.effect
    this.#idempotency = params.idempotency
  }

  async handle(envelope: SyntheticMessageEnvelopeV1): Promise<RabbitMqDisposition> {
    const idempotencyParams = { eventId: envelope.eventId }
    if (await this.#idempotency.isProcessed(idempotencyParams)) {
      return { type: 'ack' }
    }

    try {
      await this.#effect.execute({ envelope })
      await this.#idempotency.markProcessed(idempotencyParams)
      return { type: 'ack' }
    } catch (error: unknown) {
      if (error instanceof TransientWorkerError) {
        return { type: 'retry' }
      }
      if (error instanceof FatalWorkerError) {
        return { type: 'dead-letter' }
      }
      throw error
    }
  }
}
