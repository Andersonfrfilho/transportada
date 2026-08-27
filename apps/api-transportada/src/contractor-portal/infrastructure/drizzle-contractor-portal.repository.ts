/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type {
  ContractorDelivery,
  ContractorPortalRepositoryPort,
  ContractorScheduleTarget,
} from '../application/contractor-portal.types.js'
import { resolveContractorScope, type ContractorScope } from '../domain/contractor-scope.policy.js'
import {
  isBatchWithinScope,
  listContractorBatchIds,
  listContractorBindings,
} from './contractor-binding.query.js'
import {
  findScheduleTargetByAccessKey,
  listContractorDeliveries,
} from './contractor-delivery.query.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleContractorPortalRepository implements ContractorPortalRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async findScheduleTarget(input: {
    readonly accessKey: string
    readonly context: CompanyContext
    readonly scope: ContractorScope
  }): Promise<ContractorScheduleTarget | null> {
    return findScheduleTargetByAccessKey(this.database, {
      accessKey: input.accessKey,
      companyId: input.context.companyId,
      scope: input.scope,
    })
  }

  public async isBatchWithinScope(input: {
    readonly batchId: string
    readonly context: CompanyContext
    readonly scope: ContractorScope
  }): Promise<boolean> {
    return isBatchWithinScope(this.database, {
      batchId: input.batchId,
      companyId: input.context.companyId,
      contractorIds: input.scope.contractorIds,
    })
  }

  public async listBatchIds(input: {
    readonly context: CompanyContext
    readonly limit: number
    readonly scope: ContractorScope
  }): Promise<readonly string[]> {
    return listContractorBatchIds(this.database, {
      companyId: input.context.companyId,
      contractorIds: input.scope.contractorIds,
      limit: input.limit,
    })
  }

  public async listDeliveries(input: {
    readonly context: CompanyContext
    readonly limit: number
    readonly scope: ContractorScope
  }): Promise<readonly ContractorDelivery[]> {
    return listContractorDeliveries(this.database, {
      companyId: input.context.companyId,
      limit: input.limit,
      scope: input.scope,
    })
  }

  public async resolveScope(input: { readonly context: CompanyContext }): Promise<ContractorScope> {
    const bindings = await listContractorBindings(this.database, {
      companyId: input.context.companyId,
      membershipId: input.context.membershipId,
    })

    return resolveContractorScope(bindings)
  }
}
