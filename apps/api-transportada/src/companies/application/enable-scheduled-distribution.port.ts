/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type EnableScheduledDistributionResult = {
  readonly companyId: string
  readonly scheduledDistributionEnabled: true
  readonly systemActorUserId: string
}

export type DisableScheduledDistributionResult = {
  readonly companyId: string
  readonly scheduledDistributionEnabled: false
}

export type ScheduledDistributionProvisioningTransactionPort = {
  /** Preserva membership e cursor: religar não pode reprocessar NSU já consumido. */
  disableScheduledDistribution(input: { readonly companyId: string }): Promise<void>
  enableScheduledDistribution(input: { readonly companyId: string }): Promise<void>
  ensureCompanyMembership(input: { readonly companyId: string }): Promise<void>
  ensureSystemActor(): Promise<void>
}

export type ScheduledDistributionUnitOfWorkPort = {
  execute<TResult>(
    operation: (transaction: ScheduledDistributionProvisioningTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}
