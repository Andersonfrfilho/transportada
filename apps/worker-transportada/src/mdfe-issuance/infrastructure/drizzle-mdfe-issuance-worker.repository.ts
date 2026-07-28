/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { mdfeIssuanceOutbox, mdfeProcessedMessages } from '../../database/processing.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type MdfeIssuanceMessageKey = {
  readonly attemptId: string
  readonly companyId: string
  readonly eventId: string
  readonly manifestId: string
}

type DrizzleMdfeIssuanceWorkerRepositoryInput = MdfeIssuanceMessageKey & {
  readonly attempt: number
  readonly nextAttemptAt: Date
}

type MdfeIssuanceFailureWriteBack = {
  recordFailed(input: {
    readonly attemptId: string
    readonly cause: string
    readonly companyId: string
    readonly manifestId: string
    readonly occurredAt: Date
  }): Promise<void>
}

export class DrizzleMdfeIssuanceWorkerRepository {
  readonly #database: Database
  readonly #consumerName = 'mdfe-issuance-worker'
  readonly #writeBack: MdfeIssuanceFailureWriteBack | undefined

  constructor(database: Database, writeBack?: MdfeIssuanceFailureWriteBack) {
    this.#database = database
    this.#writeBack = writeBack
  }

  async hasProcessed(params: MdfeIssuanceMessageKey): Promise<boolean> {
    const [row] = await this.#database
      .select({ id: mdfeProcessedMessages.id })
      .from(mdfeProcessedMessages)
      .where(
        and(
          eq(mdfeProcessedMessages.companyId, params.companyId),
          eq(mdfeProcessedMessages.consumerName, this.#consumerName),
          eq(mdfeProcessedMessages.eventId, params.eventId),
        ),
      )
      .limit(1)

    return row !== undefined
  }

  async markProcessed(params: MdfeIssuanceMessageKey): Promise<void> {
    await this.#insertMarker({ key: params, result: {} })
  }

  async scheduleRetry(params: DrizzleMdfeIssuanceWorkerRepositoryInput): Promise<void> {
    await this.#database
      .update(mdfeIssuanceOutbox)
      .set({
        nextAttemptAt: params.nextAttemptAt,
        status: 'retry_scheduled',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mdfeIssuanceOutbox.companyId, params.companyId),
          eq(mdfeIssuanceOutbox.eventId, params.eventId),
          eq(mdfeIssuanceOutbox.manifestId, params.manifestId),
          eq(mdfeIssuanceOutbox.attemptId, params.attemptId),
        ),
      )
  }

  async markDeadLettered(
    params: MdfeIssuanceMessageKey & { readonly reason: string },
  ): Promise<void> {
    if (await this.hasProcessed(params)) {
      return
    }

    const occurredAt = new Date()

    await this.#writeBack?.recordFailed({
      attemptId: params.attemptId,
      cause: params.reason,
      companyId: params.companyId,
      manifestId: params.manifestId,
      occurredAt,
    })

    await this.#insertMarker({
      key: params,
      processedAt: occurredAt,
      result: { reason: params.reason },
    })
  }

  async #insertMarker(input: {
    readonly key: MdfeIssuanceMessageKey
    readonly processedAt?: Date
    readonly result: Record<string, unknown>
  }): Promise<void> {
    await this.#database
      .insert(mdfeProcessedMessages)
      .values({
        attemptId: input.key.attemptId,
        companyId: input.key.companyId,
        consumerName: this.#consumerName,
        createdAt: input.processedAt ?? new Date(),
        eventId: input.key.eventId,
        id: crypto.randomUUID(),
        manifestId: input.key.manifestId,
        result: JSON.stringify(input.result),
      })
      .onConflictDoNothing({
        target: [
          mdfeProcessedMessages.companyId,
          mdfeProcessedMessages.consumerName,
          mdfeProcessedMessages.eventId,
        ],
      })
  }
}
