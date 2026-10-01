/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import { API_PENDING_ITEMS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type {
  ListPendingItemsContext,
  ListPendingItemsInput,
} from '../application/list-pending-items.use-case.js'
import type { PendingItem, PendingItemPage } from '../application/pending-item-source.port.js'
import { parsePendingItemListQuery } from './pending-items.schema.js'

/**
 * A infraestrutura de rotas não tem "qualquer membro autenticado" como política — toda rota exige
 * uma `RouteAuthorizationPolicy` (`permission` + `scope`), e é ela quem devolve `403` a quem não
 * tem `fleet.read`, antes de o caso de uso rodar. O filtro por `requiredPermission` dentro de
 * `createListPendingItemsUseCase` é defesa para quando existir uma segunda fonte com outra
 * permissão — hoje, com uma fonte só e a mesma permissão da rota, ele nunca descarta nada aqui.
 */
const PENDING_ITEMS_POLICY = { permission: 'fleet.read', scope: 'company' } as const

type TenantInput<TInput> = Omit<TInput, 'context'> & { readonly context: ListPendingItemsContext }

type Dependencies = {
  readonly listPendingItems: {
    execute(input: TenantInput<ListPendingItemsInput>): Promise<PendingItemPage>
  }
}

export function createPendingItemsRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<Omit<ListPendingItemsInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.listPendingItems.execute({
          context: context.scope,
          ...input,
        })
        return pageResponse(page.items.map(serializePendingItem), page.nextCursor)
      },
      method: 'GET',
      parse: ({ request }) => parsePendingItemListQuery(new URL(request.url)),
      pathname: API_PENDING_ITEMS_PATH,
      policy: PENDING_ITEMS_POLICY,
    }),
  ]
}

function pageResponse(data: readonly object[], nextCursor: string | null): Response {
  return jsonResponse({ body: { data, page: { nextCursor } }, status: 200 })
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

function serializePendingItem(item: PendingItem): object {
  return {
    entityId: item.entityId,
    entityType: item.entityType,
    kind: item.kind,
    label: item.label,
  }
}
