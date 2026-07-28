/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CronFiscalEnvironment } from '../../config/cron.constant.js'
import { isCompanyEligibleForDistribution } from '../domain/distribution-eligibility.policy.js'
import type { DistributionCandidateSourcePort } from './select-eligible-companies.port.js'

export type EligibleCompany = {
  readonly companyId: string
  readonly environment: CronFiscalEnvironment
}

export type SelectEligibleCompaniesUseCase = {
  execute(input: {
    readonly environment: CronFiscalEnvironment
    readonly now: Date
  }): Promise<readonly EligibleCompany[]>
}

export function createSelectEligibleCompaniesUseCase(dependencies: {
  readonly source: DistributionCandidateSourcePort
}): SelectEligibleCompaniesUseCase {
  return {
    async execute({ environment, now }) {
      const candidates = await dependencies.source.listCandidates({ environment })
      return candidates
        .filter((candidate) => isCompanyEligibleForDistribution({ candidate, now }))
        .map((candidate) => ({ companyId: candidate.companyId, environment }))
    },
  }
}
