/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2b (ADR-0094 §9): `GET /cargo-arrivals/:id/documents/:documentId/products` — os itens da
 * nota da chegada para o formulário de avaria. Leitura (`fleet.read`, a permissão do separador); a
 * nota é o id da NF-e e precisa pertencer à chegada da URL.
 */
import { defineRoute } from '../../http/router.service.js'
import { parseUuidPathIdentifier, readListQuery } from '../../http/request-parsing.service.js'
import { API_CARGO_ARRIVAL_DOCUMENT_PRODUCTS_PATH } from '../../shared/api.constant.js'
import type { TripDocumentProduct } from '../../trips/application/read-trip-document-products.use-case.js'
import type { ListCargoArrivalDocumentProductsParams } from '../application/read-cargo-arrival-document-products.use-case.js'
import { CARGO_ARRIVAL_READ_POLICY, jsonResponse } from './cargo-arrival-http.support.js'

type Dependencies = {
  readonly listProducts: {
    execute(params: ListCargoArrivalDocumentProductsParams): Promise<readonly TripDocumentProduct[]>
  }
}

const NO_QUERY_KEYS: ReadonlySet<string> = new Set()

export function createCargoArrivalDocumentProductsRoute(
  dependencies: Dependencies,
): ReturnType<typeof defineRoute> {
  return defineRoute<Omit<ListCargoArrivalDocumentProductsParams, 'context'>>({
    async handle({ context, input }): Promise<Response> {
      const products = await dependencies.listProducts.execute({ context: context.scope, ...input })
      return jsonResponse({ body: { data: products }, status: 200 })
    },
    method: 'GET',
    parse: ({ pathParameters, request }) => {
      readListQuery(new URL(request.url), NO_QUERY_KEYS)
      return {
        arrivalId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
      }
    },
    pathname: API_CARGO_ARRIVAL_DOCUMENT_PRODUCTS_PATH,
    policy: CARGO_ARRIVAL_READ_POLICY,
  })
}
