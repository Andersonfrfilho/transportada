/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, desc, eq } from 'drizzle-orm'

import { companyFiscalProfiles } from '../../database/company-fiscal-profile.schema.js'
import { fiscalSequences } from '../../database/fiscal-sequence.schema.js'
import type { CteIssuanceFiscalSettings } from '../application/cte-issuance.use-case.js'
import { createCteRetryPolicy } from '../domain/cte-retry.policy.js'

import type { PayloadQueryable } from './cte-issuance-payload.query.js'

const CTE_MODEL = 'cte'

export async function findCteIssuanceFiscalSettings(
  queryable: PayloadQueryable,
  companyId: string,
): Promise<CteIssuanceFiscalSettings | null> {
  const [row] = await queryable
    .select({
      environment: companyFiscalProfiles.environment,
      retryBackoffSeconds: companyFiscalProfiles.cteRetryBackoffSeconds,
      retryMaxAttempts: companyFiscalProfiles.cteRetryMaxAttempts,
      series: fiscalSequences.series,
    })
    .from(companyFiscalProfiles)
    .innerJoin(
      fiscalSequences,
      and(
        eq(fiscalSequences.companyId, companyFiscalProfiles.companyId),
        eq(fiscalSequences.environment, companyFiscalProfiles.environment),
        eq(fiscalSequences.model, CTE_MODEL),
      ),
    )
    .where(eq(companyFiscalProfiles.companyId, companyId))
    .orderBy(desc(fiscalSequences.updatedAt), desc(fiscalSequences.id))
    .limit(1)
  if (row === undefined) return null
  return {
    environment: row.environment,
    retryPolicy: createCteRetryPolicy({
      backoffSeconds: row.retryBackoffSeconds,
      maxAttempts: row.retryMaxAttempts,
    }),
    series: row.series.toString(),
  }
}
