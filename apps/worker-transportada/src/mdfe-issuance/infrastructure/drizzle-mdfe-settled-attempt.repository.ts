/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { mdfeIssuanceAttempts } from '../../database/mdfe-issuance-execution.schema.js'
import type { MdfeSettledAttemptGuard } from '../application/mdfe-issuance-consumer.effect.js'
import { isSettledMdfeIssuanceStatus } from '../domain/mdfe-attempt-status.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleMdfeSettledAttemptRepository implements MdfeSettledAttemptGuard {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async isSettled(input: {
    readonly attemptId: string
    readonly companyId: string
  }): Promise<boolean> {
    const [attempt] = await this.#database
      .select({ status: mdfeIssuanceAttempts.status })
      .from(mdfeIssuanceAttempts)
      .where(
        and(
          eq(mdfeIssuanceAttempts.companyId, input.companyId),
          eq(mdfeIssuanceAttempts.id, input.attemptId),
        ),
      )
      .limit(1)

    return attempt === undefined ? false : isSettledMdfeIssuanceStatus(attempt.status)
  }
}
