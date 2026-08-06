/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Reads the raw candidate set for a distribution cycle: every company, joined to
 * its opt-in, its synthetic automation membership, its active certificate and the
 * anti-656 cooldown cursor for the target environment. Eligibility itself is
 * decided by the pure domain policy — this adapter only assembles the facts and
 * logs how many were seen.
 */
import { and, eq } from 'drizzle-orm'

import type { CronLogger } from '../../config/cron.types.js'
import type { CronDatabase } from '../../database/cron-database.types.js'
import { companyDistributionSettings } from '../../database/company-distribution-settings.schema.js'
import { digitalCertificates } from '../../database/digital-certificate.schema.js'
import { nfeDistributionCursors } from '../../database/distribution-cursor.schema.js'
import { companies, userCompanyMemberships } from '../../database/identity.schema.js'
import type {
  DistributionCandidate,
  DistributionCandidateSourcePort,
} from '../application/select-eligible-companies.port.js'
import { SYSTEM_DISTRIBUTION_ACTOR_USER_ID } from '../domain/system-distribution-actor.constant.js'

const ACTIVE_STATUS = 'active'
const ACTIVE_CERTIFICATE_STATUS = 'active'

export function createDrizzleDistributionCandidateSource(dependencies: {
  readonly db: CronDatabase
  readonly logger: CronLogger
}): DistributionCandidateSourcePort {
  return {
    async listCandidates({ environment }) {
      const rows = await dependencies.db
        .select({
          companyId: companies.id,
          companyStatus: companies.status,
          scheduledDistributionEnabled: companyDistributionSettings.scheduledDistributionEnabled,
          membershipId: userCompanyMemberships.id,
          certificateStatus: digitalCertificates.status,
          certificateValidFrom: digitalCertificates.validFrom,
          certificateExpiresAt: digitalCertificates.expiresAt,
          nextAllowedAt: nfeDistributionCursors.nextAllowedAt,
        })
        .from(companies)
        .leftJoin(
          companyDistributionSettings,
          eq(companyDistributionSettings.companyId, companies.id),
        )
        .leftJoin(
          userCompanyMemberships,
          and(
            eq(userCompanyMemberships.companyId, companies.id),
            eq(userCompanyMemberships.userId, SYSTEM_DISTRIBUTION_ACTOR_USER_ID),
            eq(userCompanyMemberships.status, ACTIVE_STATUS),
          ),
        )
        .leftJoin(
          digitalCertificates,
          and(
            eq(digitalCertificates.companyId, companies.id),
            eq(digitalCertificates.status, ACTIVE_CERTIFICATE_STATUS),
          ),
        )
        .leftJoin(
          nfeDistributionCursors,
          and(
            eq(nfeDistributionCursors.companyId, companies.id),
            eq(nfeDistributionCursors.environment, environment),
          ),
        )

      dependencies.logger.info('cron_distribution_candidates_evaluated', {
        environment,
        evaluatedCount: rows.length,
      })

      return rows.map(toDistributionCandidate)
    },
  }
}

export function toDistributionCandidate(row: {
  readonly companyId: string
  readonly companyStatus: 'active' | 'disabled'
  readonly scheduledDistributionEnabled: boolean | null
  readonly membershipId: string | null
  readonly certificateStatus: 'active' | 'retired' | null
  readonly certificateValidFrom: Date | null
  readonly certificateExpiresAt: Date | null
  readonly nextAllowedAt: Date | null
}): DistributionCandidate {
  return {
    companyId: row.companyId,
    companyStatus: row.companyStatus,
    scheduledDistributionEnabled: row.scheduledDistributionEnabled ?? false,
    hasSyntheticMembership: row.membershipId !== null,
    certificate:
      row.certificateStatus !== null &&
      row.certificateValidFrom !== null &&
      row.certificateExpiresAt !== null
        ? {
            status: row.certificateStatus,
            validFrom: row.certificateValidFrom,
            expiresAt: row.certificateExpiresAt,
          }
        : undefined,
    nextAllowedAt: row.nextAllowedAt ?? undefined,
  }
}
