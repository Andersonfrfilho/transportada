/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { encodeKeysetCursor } from '../../shared/keyset-cursor.support.js'
import type { CompanyPermission } from '../../identity/domain/authorization.policy.js'
import type {
  PendingItem,
  PendingItemPage,
  PendingItemSourcePort,
} from './pending-item-source.port.js'

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
 * Com uma fonte só, a paginação é a dela. Com mais de uma (spec 294 T3.2), todas paginam pelo mesmo
 * cursor `createdAt::id` em ordem decrescente: cada uma devolve até `limit` itens depois do cursor, e a
 * mescla fica com os `limit` primeiros — os `limit` primeiros da união.
 */
export function createListPendingItemsUseCase({ sources }: Dependencies): ListPendingItemsUseCase {
  return {
    async execute({ context, cursor, limit }): Promise<PendingItemPage> {
      const allowedSources = sources.filter((source) =>
        context.permissions.has(source.requiredPermission),
      )
      const [firstSource, ...otherSources] = allowedSources
      if (firstSource === undefined) return { items: [], nextCursor: null }
      const sourceInput = { companyId: context.companyId, cursor, limit }
      if (otherSources.length === 0) return firstSource.list(sourceInput)

      const pages = await Promise.all(allowedSources.map((source) => source.list(sourceInput)))
      return mergePages({ limit, pages })
    },
  }
}

function newestFirst(left: PendingItem, right: PendingItem): number {
  const byCreatedAt = (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0)
  if (byCreatedAt !== 0) return byCreatedAt
  return right.entityId.localeCompare(left.entityId)
}

function mergePages(input: {
  readonly limit: number
  readonly pages: readonly PendingItemPage[]
}): PendingItemPage {
  const merged = input.pages.flatMap((page) => page.items).sort(newestFirst)
  const items = merged.slice(0, input.limit)
  const last = items.at(-1)
  const hasMore =
    merged.length > input.limit || input.pages.some((page) => page.nextCursor !== null)
  if (!hasMore || last?.createdAt === undefined) return { items, nextCursor: null }
  return {
    items,
    nextCursor: encodeKeysetCursor({ createdAt: last.createdAt, id: last.entityId }),
  }
}
