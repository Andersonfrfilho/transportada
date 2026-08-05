/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DistributionCertificateFacts } from '../domain/distribution-eligibility.policy.js'

/** Último ciclo automático da empresa: é o que responde "quantas notas ele trouxe". */
export type ScheduledDistributionImportFacts = {
  readonly finishedAt: Date | undefined
  readonly receivedCount: number
  readonly startedAt: Date
  readonly status: string
}

export type ScheduledDistributionStatusFacts = {
  readonly certificate: DistributionCertificateFacts | undefined
  readonly companyStatus: 'active' | 'disabled'
  readonly hasSyntheticMembership: boolean
  readonly lastAutomationImport: ScheduledDistributionImportFacts | undefined
  readonly nextAllowedAt: Date | undefined
  readonly scheduledDistributionEnabled: boolean
}

export type ScheduledDistributionStatusPort = {
  loadStatusFacts(input: { readonly companyId: string }): Promise<ScheduledDistributionStatusFacts>
}
