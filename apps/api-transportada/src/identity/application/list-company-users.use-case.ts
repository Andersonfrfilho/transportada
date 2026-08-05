/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { toCompanyUserView, type CompanyUserView } from '../domain/company-user.policy.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'

type ListCompanyUsersDependencies = {
  readonly repository: Pick<CompanyUserRepositoryPort, 'listPage'>
}

export type ListCompanyUsersInput = {
  readonly context: { readonly companyId: string }
  readonly cursor: string | null
  readonly limit: number
}

export type ListCompanyUsersPage = {
  readonly items: readonly CompanyUserView[]
  readonly nextCursor: string | null
}

export type ListCompanyUsersUseCase = {
  execute(input: ListCompanyUsersInput): Promise<ListCompanyUsersPage>
}

export function createListCompanyUsersUseCase({
  repository,
}: ListCompanyUsersDependencies): ListCompanyUsersUseCase {
  return {
    async execute({ context, cursor, limit }) {
      const page = await repository.listPage({ companyId: context.companyId, cursor, limit })
      return { items: page.items.map(toCompanyUserView), nextCursor: page.nextCursor }
    },
  }
}
