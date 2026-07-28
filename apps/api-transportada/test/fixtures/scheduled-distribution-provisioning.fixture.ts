/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SYSTEM_DISTRIBUTION_ACTOR_USER_ID } from '../../src/identity/domain/system-distribution-actor.constant.js'
import type {
  ScheduledDistributionProvisioningTransactionPort,
  ScheduledDistributionUnitOfWorkPort,
} from '../../src/companies/application/enable-scheduled-distribution.port.js'

export type MembershipRecord = {
  readonly companyId: string
  readonly status: string
  readonly userId: string
}

type FailureStage = 'actor' | 'membership' | 'settings'

const membershipKey = (userId: string, companyId: string): string => `${userId}:${companyId}`

export class ScheduledDistributionProvisioningFixture
  implements ScheduledDistributionUnitOfWorkPort
{
  identityUsers = new Map<string, { readonly status: string }>()
  memberships = new Map<string, MembershipRecord>()
  distributionSettings = new Map<string, { readonly enabled: boolean }>()
  transactionCount = 0
  failOn: FailureStage | undefined

  private readonly transaction: ScheduledDistributionProvisioningTransactionPort = {
    ensureSystemActor: async () => {
      if (this.failOn === 'actor') throw new Error('system actor persistence unavailable')
      if (!this.identityUsers.has(SYSTEM_DISTRIBUTION_ACTOR_USER_ID)) {
        this.identityUsers.set(SYSTEM_DISTRIBUTION_ACTOR_USER_ID, { status: 'active' })
      }
    },
    ensureCompanyMembership: async ({ companyId }) => {
      if (this.failOn === 'membership') throw new Error('membership persistence unavailable')
      const key = membershipKey(SYSTEM_DISTRIBUTION_ACTOR_USER_ID, companyId)
      if (!this.memberships.has(key)) {
        this.memberships.set(key, {
          companyId,
          status: 'active',
          userId: SYSTEM_DISTRIBUTION_ACTOR_USER_ID,
        })
      }
    },
    enableScheduledDistribution: async ({ companyId }) => {
      if (this.failOn === 'settings')
        throw new Error('distribution settings persistence unavailable')
      this.distributionSettings.set(companyId, { enabled: true })
    },
  }

  async execute<TResult>(
    operation: (transaction: ScheduledDistributionProvisioningTransactionPort) => Promise<TResult>,
  ): Promise<TResult> {
    this.transactionCount += 1
    const snapshot = {
      identityUsers: new Map(this.identityUsers),
      memberships: new Map(this.memberships),
      distributionSettings: new Map(this.distributionSettings),
    }
    try {
      return await operation(this.transaction)
    } catch (error) {
      this.identityUsers = snapshot.identityUsers
      this.memberships = snapshot.memberships
      this.distributionSettings = snapshot.distributionSettings
      throw error
    }
  }
}
