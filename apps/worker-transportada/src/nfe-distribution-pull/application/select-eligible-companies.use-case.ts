/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { safeLogInfo } from '../../logging/safe-logger.service.js'
import type { NfeFiscalEnvironment } from '../../database/nfe.schema.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import {
  DISTRIBUTION_INELIGIBILITY_REASONS,
  evaluateDistributionEligibility,
  type DistributionIneligibilityReason,
} from '../domain/distribution-eligibility.policy.js'

import type { DistributionCandidateSourcePort } from './select-eligible-companies.port.js'

export type EligibleCompany = {
  readonly companyId: string
  readonly environment: NfeFiscalEnvironment
}

export type DistributionIneligibleCounts = Record<DistributionIneligibilityReason, number>

export type SelectEligibleCompaniesResult = {
  readonly eligible: readonly EligibleCompany[]
  readonly ineligibleCounts: DistributionIneligibleCounts
}

export type SelectEligibleCompaniesDependencies = {
  readonly logger: WorkerLogger
  readonly now: () => Date
  readonly source: DistributionCandidateSourcePort
}

/** Toda razão nasce em zero: contador ausente e contador zerado contariam histórias diferentes. */
export function createEmptyIneligibleCounts(): DistributionIneligibleCounts {
  const counts = {} as DistributionIneligibleCounts
  for (const reason of DISTRIBUTION_INELIGIBILITY_REASONS) counts[reason] = 0
  return counts
}

export async function selectEligibleCompanies(
  dependencies: SelectEligibleCompaniesDependencies,
): Promise<SelectEligibleCompaniesResult> {
  const now = dependencies.now()
  const candidates = await dependencies.source.listCandidates()
  const ineligibleCounts = createEmptyIneligibleCounts()
  const eligible: EligibleCompany[] = []

  for (const candidate of candidates) {
    const eligibility = evaluateDistributionEligibility({ candidate, now })

    if (eligibility.eligible) {
      eligible.push({ companyId: candidate.companyId, environment: candidate.environment })
      continue
    }

    ineligibleCounts[eligibility.reason] += 1
    safeLogInfo({
      logger: dependencies.logger,
      message: 'nfe_distribution_pull_company_not_eligible',
      metadata: { companyId: candidate.companyId, reason: eligibility.reason },
    })
  }

  return { eligible, ineligibleCounts }
}
