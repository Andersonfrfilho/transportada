/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { lt } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { cteIssuanceDiagnostics } from '../../database/cte-issuance-execution.schema.js'
import type {
  CteIssuanceDiagnostics,
  CteIssuanceDiagnosticsRecord,
} from '../domain/cte-issuance-diagnostics.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleCteIssuanceDiagnosticsRepository implements CteIssuanceDiagnostics {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async record(input: CteIssuanceDiagnosticsRecord): Promise<void> {
    await this.#database.insert(cteIssuanceDiagnostics).values({
      attemptId: input.attemptId,
      attemptKind: input.attemptKind,
      batchId: input.batchId,
      batchItemId: input.batchItemId,
      companyId: input.companyId,
      correlationId: input.correlationId ?? null,
      durationMs: input.durationMs ?? null,
      error: input.error ?? null,
      eventId: input.eventId,
      expiresAt: input.expiresAt,
      occurredAt: input.occurredAt,
      phase: input.phase,
      request: input.request ?? null,
      response: input.response ?? null,
    })

    await this.#purgeExpired(input.occurredAt)
  }

  /** Expurgo oportunista pelo índice de `expires_at`: sem isso a tabela temporária vira permanente. */
  async #purgeExpired(now: Date): Promise<void> {
    await this.#database
      .delete(cteIssuanceDiagnostics)
      .where(lt(cteIssuanceDiagnostics.expiresAt, now))
  }
}
