/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 316: cadastro do vendedor, ligação às contratantes e carteira. A regra mora aqui, não nas rotas: contato
 * normalizado (e-mail em minúsculas, WhatsApp em E.164) e carteira sem repetição.
 */
import { resolveSalespersonContact } from '../domain/salesperson-contact.policy.js'
import { SALESPERSON_PORTFOLIO_MAX_CLIENTS } from '../domain/salesperson.constant.js'
import { SalespersonPortfolioClientUnknownError } from '../domain/salesperson.error.js'
import type {
  PortfolioClient,
  Salesperson,
  SalespersonActor,
  SalespersonFields,
  SalespersonPort,
} from './salesperson.port.js'

type Dependencies = { readonly salespeople: SalespersonPort }

/** O corpo da tela: e-mail e WhatsApp como o operador digitou. */
export type SalespersonInput = {
  readonly email: string | null
  readonly name: string
  readonly status: SalespersonFields['status']
  readonly whatsapp: string | null
}

function toFields(input: SalespersonInput): SalespersonFields {
  return {
    ...resolveSalespersonContact({ email: input.email, whatsapp: input.whatsapp }),
    name: input.name.trim(),
    status: input.status,
  }
}

export function normalizePortfolioTaxIds(taxIds: readonly string[]): readonly string[] {
  const unique = [...new Set(taxIds.map((taxId) => taxId.trim().toUpperCase()))]
  if (unique.length > SALESPERSON_PORTFOLIO_MAX_CLIENTS) {
    throw new SalespersonPortfolioClientUnknownError()
  }

  return unique
}

export function createListSalespeopleUseCase(dependencies: Dependencies): {
  readonly execute: (params: {
    readonly companyId: string
    readonly search: string | null
  }) => Promise<readonly Salesperson[]>
} {
  return { execute: (params) => dependencies.salespeople.list(params) }
}

export function createCreateSalespersonUseCase(dependencies: Dependencies): {
  readonly execute: (
    params: SalespersonActor & { readonly input: SalespersonInput },
  ) => Promise<Salesperson>
} {
  return {
    execute: ({ input, ...actor }) =>
      dependencies.salespeople.create({ ...actor, fields: toFields(input) }),
  }
}

export function createUpdateSalespersonUseCase(dependencies: Dependencies): {
  readonly execute: (
    params: SalespersonActor & { readonly id: string; readonly input: SalespersonInput },
  ) => Promise<Salesperson>
} {
  return {
    execute: ({ input, ...rest }) =>
      dependencies.salespeople.update({ ...rest, fields: toFields(input) }),
  }
}

export function createLinkSalespersonContractorUseCase(dependencies: Dependencies): {
  readonly execute: (
    params: SalespersonActor & { readonly contractorId: string; readonly id: string },
  ) => Promise<Salesperson>
} {
  return { execute: (params) => dependencies.salespeople.linkContractor(params) }
}

export function createUnlinkSalespersonContractorUseCase(dependencies: Dependencies): {
  readonly execute: (
    params: SalespersonActor & { readonly contractorId: string; readonly id: string },
  ) => Promise<Salesperson>
} {
  return { execute: (params) => dependencies.salespeople.unlinkContractor(params) }
}

export function createReadSalespersonPortfolioUseCase(dependencies: Dependencies): {
  readonly execute: (params: {
    readonly companyId: string
    readonly contractorId: string
    readonly id: string
  }) => Promise<readonly PortfolioClient[]>
} {
  return { execute: (params) => dependencies.salespeople.readPortfolio(params) }
}

export function createReplaceSalespersonPortfolioUseCase(dependencies: Dependencies): {
  readonly execute: (
    params: SalespersonActor & {
      readonly contractorId: string
      readonly id: string
      readonly taxIds: readonly string[]
    },
  ) => Promise<readonly PortfolioClient[]>
} {
  return {
    execute: (params) =>
      dependencies.salespeople.replacePortfolio({
        ...params,
        taxIds: normalizePortfolioTaxIds(params.taxIds),
      }),
  }
}
