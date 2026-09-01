/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { UserSession } from '@adatechnology/user-contracts'

import type { CompanyGroupRepositoryPort } from '../../landing/application/company-group.port.js'
import { CPF_PATTERN, normalizeTaxId } from '../../shared/tax-id.service.js'
import {
  AggregateAccountAlreadyLinkedError,
  AggregateAccountDriverNotFoundError,
} from '../domain/aggregate-account.error.js'
import type { AggregateAccountRepositoryPort } from './aggregate-account.port.js'

const AGGREGATE_ACCOUNT_ROLE = 'aggregate'

/** Só a metade do SDK que este fluxo usa — sem depender do tipo `UserModule` inteiro aqui. */
export type AggregateAccountUserModulePort = Readonly<{
  useCases: Readonly<{
    authenticateLocal: {
      execute: (input: {
        readonly email: string
        readonly ipAddress?: string
        readonly password: string
      }) => Promise<UserSession>
    }
    createUser: {
      execute: (input: {
        readonly email: string
        readonly name: string
        readonly password: string
        readonly role: string
      }) => Promise<{ readonly id: string }>
    }
  }>
}>

export type RegisterAggregateAccountInput = Readonly<{
  email: string
  ipAddress?: string
  name: string
  password: string
  taxId: string
}>

type Dependencies = {
  readonly companyGroupRepository: CompanyGroupRepositoryPort
  readonly landingCompanyId: string
  readonly repository: AggregateAccountRepositoryPort
  readonly userModule: AggregateAccountUserModulePort
}

export type AggregateAccountUseCase = Readonly<{
  register: (input: RegisterAggregateAccountInput) => Promise<UserSession>
}>

/**
 * O CPF só prova que existe ficha aprovada — nunca é o que autentica. A conta nasce com e-mail e
 * senha próprios (`createUser` do SDK), e o vínculo (`aggregate_accounts`) é o que a Fase 2 (T3)
 * usa depois pra achar a ficha a partir da sessão logada, não o contrário.
 */
export function createAggregateAccountUseCase(dependencies: Dependencies): AggregateAccountUseCase {
  return {
    async register(input) {
      const taxId = normalizeTaxId(input.taxId)
      if (!CPF_PATTERN.test(taxId)) throw new AggregateAccountDriverNotFoundError()

      const units = await dependencies.companyGroupRepository.listGroupUnits({
        companyId: dependencies.landingCompanyId,
      })
      const companyIds = units.map((unit) => unit.companyId)

      const eligible = await dependencies.repository.findEligibleTaxId({ companyIds, taxId })
      if (eligible === null) throw new AggregateAccountDriverNotFoundError()

      const alreadyLinked = await dependencies.repository.isTaxIdLinked({
        companyId: eligible.companyId,
        taxId: eligible.taxId,
      })
      if (alreadyLinked) throw new AggregateAccountAlreadyLinkedError()

      const user = await dependencies.userModule.useCases.createUser.execute({
        email: input.email,
        name: input.name,
        password: input.password,
        role: AGGREGATE_ACCOUNT_ROLE,
      })

      await dependencies.repository.link({
        companyId: eligible.companyId,
        taxId: eligible.taxId,
        userId: user.id,
      })

      return dependencies.userModule.useCases.authenticateLocal.execute({
        email: input.email,
        password: input.password,
        ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
      })
    },
  }
}
