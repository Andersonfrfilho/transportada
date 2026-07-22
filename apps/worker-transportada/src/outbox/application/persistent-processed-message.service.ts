/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
type RunOnceResult = {
  readonly type: 'ack'
}

type PersistentProcessedMessageRepository = {
  hasProcessed(params: {
    readonly companyId: string
    readonly consumerName: string
    readonly eventId: string
  }): Promise<boolean>
  markProcessed(params: {
    readonly companyId: string
    readonly consumerName: string
    readonly eventId: string
    readonly result: string
  }): Promise<void>
  runWithProcessingLock?(params: {
    readonly companyId: string
    readonly consumerName: string
    readonly eventId: string
    readonly operation: () => Promise<RunOnceResult>
  }): Promise<RunOnceResult>
}

export class PersistentProcessedMessageService {
  readonly #repository: PersistentProcessedMessageRepository

  constructor(params: { readonly repository: PersistentProcessedMessageRepository }) {
    this.#repository = params.repository
  }

  async runOnce(params: {
    readonly companyId: string
    readonly consumerName: string
    readonly effect: () => Promise<RunOnceResult>
    readonly eventId: string
    readonly successResult: string
  }): Promise<RunOnceResult> {
    if (this.#repository.runWithProcessingLock) {
      return this.#repository.runWithProcessingLock({
        companyId: params.companyId,
        consumerName: params.consumerName,
        eventId: params.eventId,
        operation: () => this.#runOnceAfterLock(params),
      })
    }

    return this.#runOnceAfterLock(params)
  }

  async #runOnceAfterLock(params: {
    readonly companyId: string
    readonly consumerName: string
    readonly effect: () => Promise<RunOnceResult>
    readonly eventId: string
    readonly successResult: string
  }): Promise<RunOnceResult> {
    const alreadyProcessed = await this.#repository.hasProcessed({
      companyId: params.companyId,
      consumerName: params.consumerName,
      eventId: params.eventId,
    })
    if (alreadyProcessed) {
      return { type: 'ack' }
    }

    const effectResult = await params.effect()
    await this.#repository.markProcessed({
      companyId: params.companyId,
      consumerName: params.consumerName,
      eventId: params.eventId,
      result: params.successResult,
    })

    return effectResult
  }
}
