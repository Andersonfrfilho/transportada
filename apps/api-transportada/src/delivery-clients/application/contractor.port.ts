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

/**
 * O feriado é da cidade, e alimentado à mão: nenhuma fonte pública de feriado **municipal** é
 * confiável o bastante para virar dependência (ADR-0048 §3).
 */
export type MunicipalHoliday = {
  readonly cityIbgeCode: string
  readonly holidayOn: string
  readonly id: string
  readonly name: string
}

export type MunicipalHolidayRepositoryPort = {
  list(input: {
    readonly cityIbgeCode?: string
    readonly companyId: string
    readonly from?: string
    readonly to?: string
  }): Promise<readonly MunicipalHoliday[]>
  /** Idempotente por `(company_id, city_ibge_code, holiday_on)`: recadastrar o mesmo dia é no-op. */
  save(input: {
    readonly cityIbgeCode: string
    readonly companyId: string
    readonly holidayOn: string
    readonly name: string
  }): Promise<MunicipalHoliday>
  remove(input: { readonly companyId: string; readonly id: string }): Promise<boolean>
}
