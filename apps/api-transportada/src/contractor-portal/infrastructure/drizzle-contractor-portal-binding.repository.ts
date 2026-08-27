/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { contractorPortalBindings } from '../../database/client-portal.schema.js'
import { contractors } from '../../database/delivery-client.schema.js'
import {
  identityUserProfiles,
  membershipRoles,
  userCompanyMemberships,
} from '../../database/database.schema.js'
import { ContractorNotFoundError } from '../../delivery-clients/domain/delivery-client.error.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type {
  ContractorPortalBinding,
  ContractorPortalBindingRepositoryPort,
} from '../application/contractor-portal-binding.port.js'
import {
  ContractorPortalBindingNotFoundError,
  ContractorPortalRoleRequiredError,
} from '../domain/contractor-portal.error.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const BINDING_COLUMNS = {
  contractorId: contractorPortalBindings.contractorId,
  email: identityUserProfiles.email,
  id: contractorPortalBindings.id,
  membershipId: contractorPortalBindings.membershipId,
  name: identityUserProfiles.name,
  userId: userCompanyMemberships.userId,
} as const

export class DrizzleContractorPortalBindingRepository
  implements ContractorPortalBindingRepositoryPort
{
  public constructor(private readonly database: Database) {}

  public async bind(input: {
    readonly context: CompanyContext
    readonly contractorId: string
    readonly membershipId: string
  }): Promise<ContractorPortalBinding> {
    const companyId = input.context.companyId

    await this.requireContractor(companyId, input.contractorId)
    await this.requireContractorRole(companyId, input.membershipId)

    /**
     * Amarrar duas vezes é o mesmo vínculo, não erro: quem administra clica de novo quando a rede
     * some, e o unique já garante que só existe uma linha.
     */
    await this.database
      .insert(contractorPortalBindings)
      .values({
        companyId,
        contractorId: input.contractorId,
        membershipId: input.membershipId,
      })
      .onConflictDoNothing()

    const [binding] = await this.selectBindings(companyId, input.contractorId, input.membershipId)
    if (binding === undefined) throw new ContractorPortalBindingNotFoundError()

    return binding
  }

  public async list(input: {
    readonly context: CompanyContext
    readonly contractorId: string
  }): Promise<readonly ContractorPortalBinding[]> {
    await this.requireContractor(input.context.companyId, input.contractorId)

    return this.selectBindings(input.context.companyId, input.contractorId)
  }

  public async unbind(input: {
    readonly context: CompanyContext
    readonly contractorId: string
    readonly membershipId: string
  }): Promise<void> {
    const removed = await this.database
      .delete(contractorPortalBindings)
      .where(
        and(
          eq(contractorPortalBindings.companyId, input.context.companyId),
          eq(contractorPortalBindings.contractorId, input.contractorId),
          eq(contractorPortalBindings.membershipId, input.membershipId),
        ),
      )
      .returning({ id: contractorPortalBindings.id })

    if (removed.length === 0) throw new ContractorPortalBindingNotFoundError()
  }

  private async requireContractor(companyId: string, contractorId: string): Promise<void> {
    const [row] = await this.database
      .select({ id: contractors.id })
      .from(contractors)
      .where(and(eq(contractors.companyId, companyId), eq(contractors.id, contractorId)))
      .limit(1)

    if (row === undefined) throw new ContractorNotFoundError()
  }

  private async requireContractorRole(companyId: string, membershipId: string): Promise<void> {
    const [row] = await this.database
      .select({ role: membershipRoles.role })
      .from(userCompanyMemberships)
      .innerJoin(
        membershipRoles,
        and(
          eq(membershipRoles.membershipId, userCompanyMemberships.id),
          eq(membershipRoles.role, 'contractor'),
        ),
      )
      .where(
        and(
          eq(userCompanyMemberships.companyId, companyId),
          eq(userCompanyMemberships.id, membershipId),
        ),
      )
      .limit(1)

    if (row === undefined) throw new ContractorPortalRoleRequiredError()
  }

  private async selectBindings(
    companyId: string,
    contractorId: string,
    membershipId?: string,
  ): Promise<readonly ContractorPortalBinding[]> {
    return this.database
      .select(BINDING_COLUMNS)
      .from(contractorPortalBindings)
      .innerJoin(
        userCompanyMemberships,
        and(
          eq(userCompanyMemberships.companyId, contractorPortalBindings.companyId),
          eq(userCompanyMemberships.id, contractorPortalBindings.membershipId),
        ),
      )
      .innerJoin(
        identityUserProfiles,
        eq(identityUserProfiles.userId, userCompanyMemberships.userId),
      )
      .where(
        and(
          eq(contractorPortalBindings.companyId, companyId),
          eq(contractorPortalBindings.contractorId, contractorId),
          ...(membershipId === undefined
            ? []
            : [eq(contractorPortalBindings.membershipId, membershipId)]),
        ),
      )
  }
}
