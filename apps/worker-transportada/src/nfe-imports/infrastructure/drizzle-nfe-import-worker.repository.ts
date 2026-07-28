/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { processedMessages, processingOutbox } from '../../database/processing.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type NfeImportMessageKey = {
  readonly companyId: string
  readonly eventId: string
  readonly importId: string
}

export class DrizzleNfeImportWorkerRepository {
  readonly #database: Database
  readonly #consumerName = 'nfe-import-worker'

  constructor(database: Database) {
    this.#database = database
  }

  async hasProcessed(params: NfeImportMessageKey): Promise<boolean> {
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

  async markProcessed(params: NfeImportMessageKey): Promise<void> {
    if (await this.hasProcessed(params)) {
      return
    }

    await this.#database.insert(processedMessages).values({
      companyId: params.companyId,
      consumerName: this.#consumerName,
      eventId: params.eventId,
      id: crypto.randomUUID(),
      processedAt: new Date(),
      result: JSON.stringify({ importId: params.importId }),
    })
  }

  async scheduleRetry(
    params: NfeImportMessageKey & { readonly attempt: number; readonly nextAttemptAt: Date },
  ): Promise<void> {
    await this.#database
      .update(processingOutbox)
      .set({
        attempt: BigInt(params.attempt),
        nextAttemptAt: params.nextAttemptAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(processingOutbox.companyId, params.companyId),
          eq(processingOutbox.eventId, params.eventId),
        ),
      )
  }

  async markDeadLettered(params: NfeImportMessageKey & { readonly reason: string }): Promise<void> {
    if (await this.hasProcessed(params)) {
      return
    }

    await this.#database.insert(processedMessages).values({
      companyId: params.companyId,
      consumerName: this.#consumerName,
      eventId: params.eventId,
      id: crypto.randomUUID(),
      processedAt: new Date(),
      result: JSON.stringify({ importId: params.importId, reason: params.reason }),
    })
  }
}
