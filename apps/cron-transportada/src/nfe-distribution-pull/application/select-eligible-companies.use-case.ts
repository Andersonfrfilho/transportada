/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CronFiscalEnvironment } from '../../config/cron.constant.js'
import type { CronLogger } from '../../config/cron.types.js'
import {
  DISTRIBUTION_INELIGIBILITY_REASONS,
  evaluateDistributionEligibility,
  type DistributionIneligibilityReason,
} from '../domain/distribution-eligibility.policy.js'
import type { DistributionCandidateSourcePort } from './select-eligible-companies.port.js'

export type EligibleCompany = {
  readonly companyId: string
  readonly environment: CronFiscalEnvironment
}

export type DistributionIneligibleCounts = Record<DistributionIneligibilityReason, number>

export type SelectEligibleCompaniesResult = {
  readonly eligible: readonly EligibleCompany[]
  readonly ineligibleCounts: DistributionIneligibleCounts
}

export type SelectEligibleCompaniesUseCase = {
  execute(input: {
    readonly environment: CronFiscalEnvironment
    readonly now: Date
  }): Promise<SelectEligibleCompaniesResult>
}

export function createSelectEligibleCompaniesUseCase(dependencies: {
  readonly logger: CronLogger
  readonly source: DistributionCandidateSourcePort
}): SelectEligibleCompaniesUseCase {
  return {
    async execute({ environment, now }) {
      const candidates = await dependencies.source.listCandidates({ environment })
      const eligible: EligibleCompany[] = []
      const ineligibleCounts = createEmptyIneligibleCounts()

      for (const candidate of candidates) {
        const eligibility = evaluateDistributionEligibility({ candidate, now })
        if (eligibility.eligible) {
          eligible.push({ companyId: candidate.companyId, environment })
          continue
        }
        ineligibleCounts[eligibility.reason] += 1
        dependencies.logger.info('cron_company_not_eligible', {
          companyId: candidate.companyId,
          reason: eligibility.reason,
        })
      }

      return { eligible, ineligibleCounts }
    },
  }
}

export function createEmptyIneligibleCounts(): DistributionIneligibleCounts {
  const counts = {} as Record<DistributionIneligibilityReason, number>
  for (const reason of DISTRIBUTION_INELIGIBILITY_REASONS) counts[reason] = 0
  return counts
}
