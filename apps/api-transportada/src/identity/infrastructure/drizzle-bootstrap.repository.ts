/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, sql } from 'drizzle-orm'

import {
  companies,
  externalIdentities,
  identityUsers,
  membershipRoles,
  userCompanyMemberships,
} from '../../database/database.schema.js'
import {
  ENVIRONMENT_PROVISIONING_ADMIN_ROLE,
  ENVIRONMENT_PROVISIONING_LOCK_ID,
} from '../../database/environment-provisioning.constant.js'
import type {
  BootstrapAvailability,
  BootstrapPersistedAdmin,
  BootstrapRepositoryPort,
  CreateFirstAdminInput,
  ReadAvailabilityInput,
} from '../application/bootstrap-first-admin.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type Queryable = Database | Transaction

/**
 * Reusa a mesma trava do provisionamento de ambiente: os dois caminhos escrevem nas mesmas
 * tabelas de identidade/vínculo para a empresa do ambiente, e não podem correr em paralelo.
 */
export class DrizzleBootstrapRepository implements BootstrapRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async readAvailability({
    companyId,
  }: ReadAvailabilityInput): Promise<BootstrapAvailability> {
    const [companyExists, hasActiveCompanyAdmin] = await Promise.all([
      this.hasActiveCompany(this.database, companyId),
      this.hasActiveCompanyAdmin(this.database, companyId),
    ])

    return { companyExists, hasActiveCompanyAdmin }
  }

  public async createFirstAdmin({
    companyId,
    issuer,
    subject,
  }: CreateFirstAdminInput): Promise<BootstrapPersistedAdmin | undefined> {
    return this.database.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(${ENVIRONMENT_PROVISIONING_LOCK_ID})`,
      )

      if (await this.hasActiveCompanyAdmin(transaction, companyId)) {
        return undefined
      }

      const userId = crypto.randomUUID()
      await transaction.insert(identityUsers).values({ id: userId, status: 'active' })
      await transaction
        .insert(externalIdentities)
        .values({ id: crypto.randomUUID(), issuer, subject, userId })

      const membershipId = crypto.randomUUID()
      await transaction
        .insert(userCompanyMemberships)
        .values({ companyId, id: membershipId, status: 'active', userId })
      await transaction
        .insert(membershipRoles)
        .values({ membershipId, role: ENVIRONMENT_PROVISIONING_ADMIN_ROLE })

      return { membershipId, userId }
    })
  }

  private async hasActiveCompany(executor: Queryable, companyId: string): Promise<boolean> {
    const [company] = await executor
      .select({ status: companies.status })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)

    return company !== undefined && company.status === 'active'
  }

  private async hasActiveCompanyAdmin(executor: Queryable, companyId: string): Promise<boolean> {
    const [role] = await executor
      .select({ membershipId: membershipRoles.membershipId })
      .from(membershipRoles)
      .innerJoin(
        userCompanyMemberships,
        eq(userCompanyMemberships.id, membershipRoles.membershipId),
      )
      .where(
        and(
          eq(userCompanyMemberships.companyId, companyId),
          eq(userCompanyMemberships.status, 'active'),
          eq(membershipRoles.role, ENVIRONMENT_PROVISIONING_ADMIN_ROLE),
        ),
      )
      .limit(1)

    return role !== undefined
  }
}
