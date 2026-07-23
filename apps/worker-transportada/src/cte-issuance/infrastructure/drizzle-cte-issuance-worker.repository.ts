/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { cteIssuanceOutbox, processedMessages } from '../../database/processing.schema.js'

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

export class DrizzleCteIssuanceWorkerRepository {
  readonly #database: Database
  readonly #consumerName = 'cte-issuance-worker'

  constructor(database: Database) {
    this.#database = database
  }

  async hasProcessed(params: CteIssuanceMessageKey): Promise<boolean> {
    const [row] = await this.#database
      .select({ id: processedMessages.id })
      .from(processedMessages)
      .where(
        and(
          eq(processedMessages.companyId, params.companyId),
          eq(processedMessages.consumerName, this.#consumerName),
          eq(processedMessages.eventId, params.eventId),
        ),
      )
      .limit(1)

    return row !== undefined
  }

  async markProcessed(params: CteIssuanceMessageKey): Promise<void> {
    if (await this.hasProcessed(params)) {
      return
    }

    await this.#database.insert(processedMessages).values({
      companyId: params.companyId,
      consumerName: this.#consumerName,
      eventId: params.eventId,
      id: crypto.randomUUID(),
      processedAt: new Date(),
      result: JSON.stringify({ attemptId: params.attemptId, batchItemId: params.batchItemId }),
    })
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

    await this.#database.insert(processedMessages).values({
      companyId: params.companyId,
      consumerName: this.#consumerName,
      eventId: params.eventId,
      id: crypto.randomUUID(),
      processedAt: new Date(),
      result: JSON.stringify({
        attemptId: params.attemptId,
        batchItemId: params.batchItemId,
        reason: params.reason,
      }),
    })
  }
}
