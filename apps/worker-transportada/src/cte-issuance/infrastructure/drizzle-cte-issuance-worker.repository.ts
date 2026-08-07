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

type CteIssuanceFailureWriteBackInput = {
  readonly attemptId: string
  readonly batchItemId: string
  readonly cause: string
  readonly companyId: string
  readonly occurredAt: Date
}

type CteIssuanceFailureWriteBack = {
  recordFailed(input: CteIssuanceFailureWriteBackInput): Promise<void>
  recordReconciliationRequired(input: CteIssuanceFailureWriteBackInput): Promise<void>
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
    await this.#settle({
      key: params,
      reason: params.reason,
      write: async (input) => this.#writeBack?.recordFailed(input),
    })
  }

  /** O erro desconhecido pode ter acontecido depois da transmissão: só a SEFAZ sabe o desfecho. */
  async markReconciliationRequired(
    params: CteIssuanceMessageKey & { readonly reason: string },
  ): Promise<void> {
    await this.#settle({
      key: params,
      reason: params.reason,
      write: async (input) => this.#writeBack?.recordReconciliationRequired(input),
    })
  }

  async #settle(input: {
    readonly key: CteIssuanceMessageKey
    readonly reason: string
    readonly write: (params: CteIssuanceFailureWriteBackInput) => Promise<void>
  }): Promise<void> {
    if (await this.hasProcessed(input.key)) {
      return
    }

    const occurredAt = new Date()

    await input.write({
      attemptId: input.key.attemptId,
      batchItemId: input.key.batchItemId,
      cause: input.reason,
      companyId: input.key.companyId,
      occurredAt,
    })

    await this.#insertMarker({
      key: input.key,
      processedAt: occurredAt,
      result: { reason: input.reason },
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
