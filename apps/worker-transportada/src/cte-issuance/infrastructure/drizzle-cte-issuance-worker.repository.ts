/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { cteIssuanceOutbox, cteProcessedMessages } from '../../database/processing.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type CteIssuanceMessageKey = {
  readonly attemptId: string
  readonly batchItemId: string
  readonly companyId: string
  readonly eventId: string
}

type DrizzleCteIssuanceWorkerRepositoryInput = {
  readonly attempt: number
  readonly attemptId: string
  readonly batchItemId: string
  readonly companyId: string
  readonly eventId: string
  readonly nextAttemptAt: Date
}

type CteIssuanceFailureWriteBack = {
  recordFailed(input: {
    readonly attemptId: string
    readonly batchItemId: string
    readonly cause: string
    readonly companyId: string
    readonly occurredAt: Date
  }): Promise<void>
}

export class DrizzleCteIssuanceWorkerRepository {
  readonly #database: Database
  readonly #consumerName = 'cte-issuance-worker'
  readonly #writeBack: CteIssuanceFailureWriteBack | undefined

  constructor(database: Database, writeBack?: CteIssuanceFailureWriteBack) {
    this.#database = database
    this.#writeBack = writeBack
  }

  async hasProcessed(params: CteIssuanceMessageKey): Promise<boolean> {
    const [row] = await this.#database
      .select({ id: cteProcessedMessages.id })
      .from(cteProcessedMessages)
      .where(
        and(
          eq(cteProcessedMessages.companyId, params.companyId),
          eq(cteProcessedMessages.consumerName, this.#consumerName),
          eq(cteProcessedMessages.eventId, params.eventId),
        ),
      )
      .limit(1)

    return row !== undefined
  }

  async markProcessed(params: CteIssuanceMessageKey): Promise<void> {
    await this.#insertMarker({ key: params, result: {} })
  }

  async scheduleRetry(params: DrizzleCteIssuanceWorkerRepositoryInput): Promise<void> {
    await this.#database
      .update(cteIssuanceOutbox)
      .set({
        nextAttemptAt: params.nextAttemptAt,
        status: 'retry_scheduled',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cteIssuanceOutbox.companyId, params.companyId),
          eq(cteIssuanceOutbox.eventId, params.eventId),
          eq(cteIssuanceOutbox.batchItemId, params.batchItemId),
          eq(cteIssuanceOutbox.attemptId, params.attemptId),
        ),
      )
  }

  async markDeadLettered(
    params: CteIssuanceMessageKey & { readonly reason: string },
  ): Promise<void> {
    if (await this.hasProcessed(params)) {
      return
    }

    const occurredAt = new Date()

    await this.#writeBack?.recordFailed({
      attemptId: params.attemptId,
      batchItemId: params.batchItemId,
      cause: params.reason,
      companyId: params.companyId,
      occurredAt,
    })

    await this.#insertMarker({
      key: params,
      processedAt: occurredAt,
      result: { reason: params.reason },
    })
  }

  async #insertMarker(input: {
    readonly key: CteIssuanceMessageKey
    readonly processedAt?: Date
    readonly result: Record<string, unknown>
  }): Promise<void> {
    await this.#database
      .insert(cteProcessedMessages)
      .values({
        attemptId: input.key.attemptId,
        batchItemId: input.key.batchItemId,
        companyId: input.key.companyId,
        consumerName: this.#consumerName,
        createdAt: input.processedAt ?? new Date(),
        eventId: input.key.eventId,
        id: crypto.randomUUID(),
        result: JSON.stringify(input.result),
      })
      .onConflictDoNothing({
        target: [
          cteProcessedMessages.companyId,
          cteProcessedMessages.consumerName,
          cteProcessedMessages.eventId,
        ],
      })
  }
}
