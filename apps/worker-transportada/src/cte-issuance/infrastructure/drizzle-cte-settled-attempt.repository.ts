/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { cteIssuanceAttempts } from '../../database/cte-issuance-execution.schema.js'
import type { CteSettledAttemptGuard } from '../application/cte-issuance-consumer.effect.js'
import { isSettledCteIssuanceStatus } from '../domain/cte-batch-progress.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleCteSettledAttemptRepository implements CteSettledAttemptGuard {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async isSettled(input: {
    readonly attemptId: string
    readonly companyId: string
  }): Promise<boolean> {
    const [attempt] = await this.#database
      .select({ status: cteIssuanceAttempts.status })
      .from(cteIssuanceAttempts)
      .where(
        and(
          eq(cteIssuanceAttempts.companyId, input.companyId),
          eq(cteIssuanceAttempts.id, input.attemptId),
        ),
      )
      .limit(1)

    return attempt === undefined ? false : isSettledCteIssuanceStatus(attempt.status)
  }
}
