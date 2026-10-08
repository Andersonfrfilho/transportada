/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  ContractorClosingPeriod,
  DeliveryClientStatus,
} from '../../database/delivery-client.schema.js'

export type Contractor = {
  readonly closingPeriod: ContractorClosingPeriod
  readonly displayName: string
  readonly id: string
  readonly notes: string
  readonly reportEmail: string
  readonly status: DeliveryClientStatus
  readonly taxId: string
}

export type ContractorPage = {
  readonly items: readonly Contractor[]
  readonly nextCursor: string | null
}

export type ContractorWriteInput = {
  readonly closingPeriod?: ContractorClosingPeriod
  readonly displayName?: string
  readonly notes?: string
  readonly reportEmail?: string
  readonly status?: DeliveryClientStatus
}

export type ContractorListFilters = {
  readonly cursor?: string
  readonly limit: number
  readonly nameContains?: string
  readonly status?: DeliveryClientStatus
}

export type ContractorRepositoryPort = {
  create(input: {
    readonly companyId: string
    readonly taxId: string
    readonly values: ContractorWriteInput
  }): Promise<Contractor>
  findById(input: { readonly companyId: string; readonly id: string }): Promise<Contractor | null>
  findByTaxId(input: {
    readonly companyId: string
    readonly taxId: string
  }): Promise<Contractor | null>
  list(input: {
    readonly companyId: string
    readonly filters: ContractorListFilters
  }): Promise<ContractorPage>
  update(input: {
    readonly companyId: string
    readonly id: string
    readonly values: ContractorWriteInput
  }): Promise<Contractor | null>
}
