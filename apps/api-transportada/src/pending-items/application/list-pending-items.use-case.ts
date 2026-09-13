/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyPermission } from '../../identity/domain/authorization.policy.js'
import type { PendingItemPage, PendingItemSourcePort } from './pending-item-source.port.js'

export type ListPendingItemsContext = {
  readonly companyId: string
  readonly permissions: ReadonlySet<CompanyPermission>
}

export type ListPendingItemsInput = {
  readonly context: ListPendingItemsContext
  readonly cursor: string | null
  readonly limit: number
}

export type ListPendingItemsUseCase = {
  execute(input: ListPendingItemsInput): Promise<PendingItemPage>
}

type Dependencies = {
  readonly sources: readonly PendingItemSourcePort[]
}

/**
 * A página é genérica: agrega as fontes cujo `requiredPermission` o chamador tem. Quem não tem
 * nenhuma recebe lista vazia, nunca `403` — a rota aceita qualquer membro autenticado, e a
 * filtragem é por fonte (spec 147 D2).
 *
 * Com uma fonte só, a paginação é a dela — mesclar páginas de mais de uma fonte fica para quando a
 * segunda existir.
 */
export function createListPendingItemsUseCase({ sources }: Dependencies): ListPendingItemsUseCase {
  return {
    async execute({ context, cursor, limit }): Promise<PendingItemPage> {
      const allowedSources = sources.filter((source) =>
        context.permissions.has(source.requiredPermission),
      )
      const [firstSource] = allowedSources
      if (firstSource === undefined) return { items: [], nextCursor: null }
      return firstSource.list({ companyId: context.companyId, cursor, limit })
    },
  }
}
