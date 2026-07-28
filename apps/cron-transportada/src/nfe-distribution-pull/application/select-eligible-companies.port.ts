/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CronFiscalEnvironment } from '../../config/cron.constant.js'
import type { CertificateStatus } from '../../database/digital-certificate.schema.js'

export type DistributionCandidateCertificate = {
  readonly status: CertificateStatus
  readonly validFrom: Date
  readonly expiresAt: Date
}

export type DistributionCandidate = {
  readonly companyId: string
  readonly companyStatus: 'active' | 'disabled'
  readonly scheduledDistributionEnabled: boolean
  readonly hasSyntheticMembership: boolean
  readonly certificate: DistributionCandidateCertificate | undefined
  readonly nextAllowedAt: Date | undefined
}

export type DistributionCandidateSourcePort = {
  listCandidates(input: {
    readonly environment: CronFiscalEnvironment
  }): Promise<readonly DistributionCandidate[]>
}
