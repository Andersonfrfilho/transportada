/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq } from 'drizzle-orm'

import { digitalCertificates } from '../../database/cte-issuance-execution.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type MdfeActiveCertificate = {
  readonly id: string
  readonly secretEnvelope: unknown
}

export class DrizzleMdfeCertificateRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async findActiveCertificate(input: {
    readonly companyId: string
  }): Promise<MdfeActiveCertificate | null> {
    const [certificate] = await this.#database
      .select({
        id: digitalCertificates.id,
        secretEnvelope: digitalCertificates.secretEnvelope,
      })
      .from(digitalCertificates)
      .where(
        and(
          eq(digitalCertificates.companyId, input.companyId),
          eq(digitalCertificates.purpose, 'mdfe'),
          eq(digitalCertificates.status, 'active'),
        ),
      )
      .orderBy(desc(digitalCertificates.createdAt), desc(digitalCertificates.version))
      .limit(1)
    return certificate ?? null
  }
}
