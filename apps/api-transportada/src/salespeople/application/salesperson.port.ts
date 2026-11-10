/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SalespersonStatus } from '../../database/salesperson.schema.js'
import type { SalespersonContact } from '../domain/salesperson-contact.policy.js'

export type SalespersonContractorLink = {
  readonly clientCount: number
  readonly contractorId: string
  readonly contractorName: string
}

export type Salesperson = {
  readonly contractors: readonly SalespersonContractorLink[]
  readonly createdAt: Date
  readonly email: string | null
  readonly id: string
  readonly name: string
  readonly status: SalespersonStatus
  readonly updatedAt: Date
  readonly whatsappE164: string | null
}

/** O que o escritório edita. A empresa e o ator nunca fazem parte do corpo. */
export type SalespersonFields = SalespersonContact & {
  readonly name: string
  readonly status: SalespersonStatus
}

export type SalespersonActor = {
  readonly companyId: string
  readonly correlationId: string
  readonly ipAddress: string
  readonly userId: string
}

export type PortfolioClient = { readonly displayName: string; readonly taxId: string }

/** Toda escrita grava a auditoria na mesma transação. */
export type SalespersonPort = {
  create(params: SalespersonActor & { readonly fields: SalespersonFields }): Promise<Salesperson>
  linkContractor(
    params: SalespersonActor & { readonly contractorId: string; readonly id: string },
  ): Promise<Salesperson>
  list(params: {
    readonly companyId: string
    readonly search: string | null
  }): Promise<readonly Salesperson[]>
  readPortfolio(params: {
    readonly companyId: string
    readonly contractorId: string
    readonly id: string
  }): Promise<readonly PortfolioClient[]>
  replacePortfolio(
    params: SalespersonActor & {
      readonly contractorId: string
      readonly id: string
      readonly taxIds: readonly string[]
    },
  ): Promise<readonly PortfolioClient[]>
  unlinkContractor(
    params: SalespersonActor & { readonly contractorId: string; readonly id: string },
  ): Promise<Salesperson>
  update(
    params: SalespersonActor & { readonly fields: SalespersonFields; readonly id: string },
  ): Promise<Salesperson>
}
