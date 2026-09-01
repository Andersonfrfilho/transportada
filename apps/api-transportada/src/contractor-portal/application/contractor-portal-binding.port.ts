/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'

export type ContractorPortalBinding = {
  readonly contractorId: string
  readonly email: string
  readonly id: string
  readonly membershipId: string
  readonly name: string
  readonly userId: string
}

export type ContractorPortalBindingRepositoryPort = {
  bind(input: {
    readonly context: CompanyContext
    readonly contractorId: string
    readonly membershipId: string
  }): Promise<ContractorPortalBinding>
  list(input: {
    readonly context: CompanyContext
    readonly contractorId: string
  }): Promise<readonly ContractorPortalBinding[]>
  unbind(input: {
    readonly context: CompanyContext
    readonly contractorId: string
    readonly membershipId: string
  }): Promise<void>
}
