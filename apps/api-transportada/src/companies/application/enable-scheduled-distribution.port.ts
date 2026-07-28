/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type EnableScheduledDistributionResult = {
  readonly companyId: string
  readonly scheduledDistributionEnabled: true
  readonly systemActorUserId: string
}

export type ScheduledDistributionProvisioningTransactionPort = {
  enableScheduledDistribution(input: { readonly companyId: string }): Promise<void>
  ensureCompanyMembership(input: { readonly companyId: string }): Promise<void>
  ensureSystemActor(): Promise<void>
}

export type ScheduledDistributionUnitOfWorkPort = {
  execute<TResult>(
    operation: (transaction: ScheduledDistributionProvisioningTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}
