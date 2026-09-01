/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import {
  ContractorAlreadyExistsError,
  ContractorNotFoundError,
} from '../domain/delivery-client.error.js'
import type {
  Contractor,
  ContractorListFilters,
  ContractorPage,
  ContractorRepositoryPort,
  ContractorWriteInput,
  MunicipalHoliday,
  MunicipalHolidayRepositoryPort,
} from './contractor.port.js'

export type ContractorsUseCase = {
  create(input: {
    readonly context: CompanyContext
    readonly taxId: string
    readonly values: ContractorWriteInput
  }): Promise<Contractor>
  get(input: { readonly context: CompanyContext; readonly id: string }): Promise<Contractor>
  getByTaxId(input: {
    readonly context: CompanyContext
    readonly taxId: string
  }): Promise<Contractor>
  list(input: {
    readonly context: CompanyContext
    readonly filters: ContractorListFilters
  }): Promise<ContractorPage>
  update(input: {
    readonly context: CompanyContext
    readonly id: string
    readonly values: ContractorWriteInput
  }): Promise<Contractor>
}

export function createContractorsUseCase(dependencies: {
  readonly repository: ContractorRepositoryPort
}): ContractorsUseCase {
  const { repository } = dependencies

  return {
    async create({ context, taxId, values }) {
      const existing = await repository.findByTaxId({ companyId: context.companyId, taxId })
      if (existing !== null) throw new ContractorAlreadyExistsError(existing.id)

      return repository.create({ companyId: context.companyId, taxId, values })
    },
    async get({ context, id }) {
      const found = await repository.findById({ companyId: context.companyId, id })
      if (found === null) throw new ContractorNotFoundError()
      return found
    },
    async getByTaxId({ context, taxId }) {
      const found = await repository.findByTaxId({ companyId: context.companyId, taxId })
      if (found === null) throw new ContractorNotFoundError()
      return found
    },
    async list({ context, filters }) {
      return repository.list({ companyId: context.companyId, filters })
    },
    async update({ context, id, values }) {
      const updated = await repository.update({ companyId: context.companyId, id, values })
      if (updated === null) throw new ContractorNotFoundError()
      return updated
    },
  }
}

export type MunicipalHolidaysUseCase = {
  list(input: {
    readonly cityIbgeCode?: string
    readonly context: CompanyContext
    readonly from?: string
    readonly to?: string
  }): Promise<readonly MunicipalHoliday[]>
  remove(input: { readonly context: CompanyContext; readonly id: string }): Promise<void>
  save(input: {
    readonly cityIbgeCode: string
    readonly context: CompanyContext
    readonly holidayOn: string
    readonly name: string
  }): Promise<MunicipalHoliday>
}

export function createMunicipalHolidaysUseCase(dependencies: {
  readonly repository: MunicipalHolidayRepositoryPort
}): MunicipalHolidaysUseCase {
  return {
    async list({ context, ...filters }) {
      return dependencies.repository.list({ companyId: context.companyId, ...filters })
    },
    async remove({ context, id }) {
      /** Apagar o que não existe é no-op: o operador clicou duas vezes, e isso não é conflito. */
      await dependencies.repository.remove({ companyId: context.companyId, id })
    },
    async save({ context, ...holiday }) {
      return dependencies.repository.save({ companyId: context.companyId, ...holiday })
    },
  }
}
