/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { nfseIssuanceOutbox, nfseProcessedMessages } from '../../database/processing.schema.js'
import type { NfseIssuanceMessageKey } from '../application/nfse-issuance-worker-message-handler.service.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type NfseIssuanceFailureWriteBack = {
  recordFailed(input: {
    readonly attemptId: string
    readonly cause: string
    readonly companyId: string
    readonly invoiceId: string
    readonly occurredAt: Date
  }): Promise<void>
}

const CONSUMER_NAME = 'nfse-issuance-worker'
const RETRY_SCHEDULED_STATUS = 'retry_scheduled'

export class DrizzleNfseIssuanceWorkerRepository {
  readonly #database: Database
  readonly #writeBack: NfseIssuanceFailureWriteBack | undefined

  constructor(database: Database, writeBack?: NfseIssuanceFailureWriteBack) {
    this.#database = database
    this.#writeBack = writeBack
  }

  async hasProcessed(params: NfseIssuanceMessageKey): Promise<boolean> {
    const [row] = await this.#database
      .select({ id: nfseProcessedMessages.id })
      .from(nfseProcessedMessages)
      .where(
        and(
          eq(nfseProcessedMessages.companyId, params.companyId),
          eq(nfseProcessedMessages.consumerName, CONSUMER_NAME),
          eq(nfseProcessedMessages.eventId, params.eventId),
        ),
      )
      .limit(1)

    return row !== undefined
  }

  async markProcessed(params: NfseIssuanceMessageKey): Promise<void> {
    await this.#insertMarker({ key: params, result: {} })
  }

  async scheduleRetry(
    params: NfseIssuanceMessageKey & { readonly nextAttemptAt: Date },
  ): Promise<void> {
    await this.#database
      .update(nfseIssuanceOutbox)
      .set({
        nextAttemptAt: params.nextAttemptAt,
        status: RETRY_SCHEDULED_STATUS,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(nfseIssuanceOutbox.companyId, params.companyId),
          eq(nfseIssuanceOutbox.eventId, params.eventId),
          eq(nfseIssuanceOutbox.invoiceId, params.invoiceId),
          eq(nfseIssuanceOutbox.attemptId, params.attemptId),
        ),
      )
  }

  async markDeadLettered(
    params: NfseIssuanceMessageKey & { readonly reason: string },
  ): Promise<void> {
    if (await this.hasProcessed(params)) {
      return
    }

    const occurredAt = new Date()

    await this.#writeBack?.recordFailed({
      attemptId: params.attemptId,
      cause: params.reason,
      companyId: params.companyId,
      invoiceId: params.invoiceId,
      occurredAt,
    })

    await this.#insertMarker({
      key: params,
      processedAt: occurredAt,
      result: { reason: params.reason },
    })
  }

  async #insertMarker(input: {
    readonly key: NfseIssuanceMessageKey
    readonly processedAt?: Date
    readonly result: Record<string, unknown>
  }): Promise<void> {
    await this.#database
      .insert(nfseProcessedMessages)
      .values({
        attemptId: input.key.attemptId,
        companyId: input.key.companyId,
        consumerName: CONSUMER_NAME,
        createdAt: input.processedAt ?? new Date(),
        eventId: input.key.eventId,
        id: crypto.randomUUID(),
        invoiceId: input.key.invoiceId,
        result: JSON.stringify(input.result),
      })
      .onConflictDoNothing({
        target: [
          nfseProcessedMessages.companyId,
          nfseProcessedMessages.consumerName,
          nfseProcessedMessages.eventId,
        ],
      })
  }
}
