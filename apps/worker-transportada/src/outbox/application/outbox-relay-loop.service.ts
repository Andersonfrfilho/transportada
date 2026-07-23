/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { safeLogError } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'

type RelayLoopClock = {
  setInterval(handler: () => void, intervalMs: number): Timer
  clearInterval(timer: Timer): void
}

type RelayLoopRelay = {
  relayDueEntries(params: {
    readonly claimOwner: string
    readonly leaseMs: number
    readonly limit: number
  }): Promise<unknown>
}

export class OutboxRelayLoop {
  readonly #claimOwner: string
  readonly #clock: RelayLoopClock
  readonly #failureMessage: string
  readonly #intervalMs: number
  readonly #leaseMs: number
  readonly #limit: number
  readonly #logger: WorkerLogger
  readonly #relay: RelayLoopRelay
  #inFlight: Promise<void> | undefined
  #timer: Timer | undefined

  constructor(params: {
    readonly claimOwner: string
    readonly clock?: RelayLoopClock
    readonly failureMessage: string
    readonly intervalMs: number
    readonly leaseMs: number
    readonly limit: number
    readonly logger: WorkerLogger
    readonly relay: RelayLoopRelay
  }) {
    this.#claimOwner = params.claimOwner
    this.#clock = params.clock ?? globalThis
    this.#failureMessage = params.failureMessage
    this.#intervalMs = params.intervalMs
    this.#leaseMs = params.leaseMs
    this.#limit = params.limit
    this.#logger = params.logger
    this.#relay = params.relay
  }

  start(): void {
    if (this.#timer !== undefined) {
      return
    }

    this.#timer = this.#clock.setInterval(() => {
      void this.tick()
    }, this.#intervalMs)
    void this.tick()
  }

  async close(): Promise<void> {
    if (this.#timer !== undefined) {
      this.#clock.clearInterval(this.#timer)
      this.#timer = undefined
    }

    await this.#inFlight
  }

  private async tick(): Promise<void> {
    if (this.#inFlight !== undefined) {
      return
    }

    this.#inFlight = this.#runOnce().finally(() => {
      this.#inFlight = undefined
    })
    await this.#inFlight
  }

  async #runOnce(): Promise<void> {
    try {
      await this.#relay.relayDueEntries({
        claimOwner: this.#claimOwner,
        leaseMs: this.#leaseMs,
        limit: this.#limit,
      })
    } catch (error: unknown) {
      safeLogError({
        logger: this.#logger,
        message: this.#failureMessage,
        metadata: {
          error: error instanceof Error ? error.message : 'unknown',
        },
      })
    }
  }
}
