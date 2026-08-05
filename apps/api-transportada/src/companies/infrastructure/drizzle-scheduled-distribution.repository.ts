/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Provisionamento do opt-in da distribuição agendada. Ator sintético, membership
 * e flag caem na mesma transação: meio-provisionado deixaria o cron enfileirando
 * import sem dono, que o NOT NULL de nfe_imports rejeitaria em runtime.
 */
import { sql } from 'drizzle-orm'

import {
  companyDistributionSettings,
  identityUsers,
  userCompanyMemberships,
} from '../../database/database.schema.js'
import { SYSTEM_DISTRIBUTION_ACTOR_USER_ID } from '../../identity/domain/system-distribution-actor.constant.js'
import type {
  ScheduledDistributionProvisioningTransactionPort,
  ScheduledDistributionUnitOfWorkPort,
} from '../application/enable-scheduled-distribution.port.js'
import type {
  CompanySettingsDatabase,
  CompanySettingsTransaction,
} from './drizzle-company-settings.types.js'

export class DrizzleScheduledDistributionRepository implements ScheduledDistributionUnitOfWorkPort {
  public constructor(private readonly database: CompanySettingsDatabase) {}

  public execute<TResult>(
    operation: (transaction: ScheduledDistributionProvisioningTransactionPort) => Promise<TResult>,
  ): Promise<TResult> {
    return this.database.transaction((transaction) =>
      operation(createProvisioningTransaction(transaction)),
    )
  }
}

function createProvisioningTransaction(
  transaction: CompanySettingsTransaction,
): ScheduledDistributionProvisioningTransactionPort {
  return {
    disableScheduledDistribution: async ({ companyId }) => {
      await upsertScheduledDistribution(transaction, companyId, false)
    },
    enableScheduledDistribution: async ({ companyId }) => {
      await upsertScheduledDistribution(transaction, companyId, true)
    },
    ensureCompanyMembership: async ({ companyId }) => {
      await transaction
        .insert(userCompanyMemberships)
        .values({ companyId, status: 'active', userId: SYSTEM_DISTRIBUTION_ACTOR_USER_ID })
        .onConflictDoUpdate({
          set: { status: 'active', updatedAt: sql`now()` },
          target: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
        })
    },
    ensureSystemActor: async () => {
      await transaction
        .insert(identityUsers)
        .values({ id: SYSTEM_DISTRIBUTION_ACTOR_USER_ID, status: 'active' })
        .onConflictDoNothing({ target: identityUsers.id })
    },
  }
}

async function upsertScheduledDistribution(
  transaction: CompanySettingsTransaction,
  companyId: string,
  enabled: boolean,
): Promise<void> {
  await transaction
    .insert(companyDistributionSettings)
    .values({ companyId, scheduledDistributionEnabled: enabled })
    .onConflictDoUpdate({
      set: { scheduledDistributionEnabled: enabled, updatedAt: sql`now()` },
      target: companyDistributionSettings.companyId,
    })
}
