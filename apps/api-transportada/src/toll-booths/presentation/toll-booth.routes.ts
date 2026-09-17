/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * `GET /v1/toll-booths` — o catálogo inteiro (spec 154 RF1), nunca só as praças que a operação já
 * cruzou (essa é `GET /company-settings/toll-booth-charges`, spec 095, e continua existindo). O
 * módulo não tinha camada `presentation/` antes desta rota (plano 154 item 3).
 */
import { defineRoute } from '../../http/router.service.js'
import { API_TOLL_BOOTHS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type {
  ListTollBoothCatalogResult,
  TollBoothCatalogEntryView,
} from '../application/list-toll-booth-catalog.use-case.js'
import { parseTollBoothCatalogQuery, type TollBoothCatalogQuery } from './toll-booth.schema.js'

const FLEET_READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

type Dependencies = {
  readonly listCatalog: {
    execute(
      input: TollBoothCatalogQuery & { readonly companyId: string },
    ): Promise<ListTollBoothCatalogResult>
  }
}

export function createTollBoothRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<TollBoothCatalogQuery>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.listCatalog.execute({
          companyId: context.scope.companyId,
          ...input,
        })
        return jsonResponse({
          body: {
            data: page.rows.map(serializeCatalogEntry),
            pagination: { page: page.page, perPage: page.perPage, total: page.total },
            summary: page.summary,
          },
        })
      },
      method: 'GET',
      parse: ({ request }) => parseTollBoothCatalogQuery(new URL(request.url)),
      pathname: API_TOLL_BOOTHS_PATH,
      policy: FLEET_READ_POLICY,
    }),
  ]
}

function serializeCatalogEntry(entry: TollBoothCatalogEntryView): Record<string, unknown> {
  return {
    actorUserId: entry.actorUserId,
    catalog: entry.catalog,
    catalogKnown: entry.catalogKnown,
    chargeCarSource: entry.chargeCarSource,
    chargePerAxleAutomaticSource: entry.chargePerAxleAutomaticSource,
    chargePerAxleSource: entry.chargePerAxleSource,
    effectiveChargeCar: entry.effectiveChargeCar,
    effectiveChargePerAxle: entry.effectiveChargePerAxle,
    effectiveChargePerAxleAutomatic: entry.effectiveChargePerAxleAutomatic,
    name: entry.name,
    observedOn: entry.observedOn,
    operator: entry.operator,
    osmNodeId: entry.osmNodeId,
    seen: entry.seen,
    source: entry.source,
    updatedAt: entry.updatedAt?.toISOString() ?? null,
  }
}

function jsonResponse(input: { readonly body: unknown }): Response {
  return new Response(JSON.stringify(input.body), { headers: NO_STORE_HEADERS, status: 200 })
}
