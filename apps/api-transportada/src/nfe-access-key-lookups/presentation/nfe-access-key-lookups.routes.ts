/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import { API_NFE_ACCESS_KEY_LOOKUPS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type {
  AccessKeyLookupView,
  GetAccessKeyLookupParams,
  RequestAccessKeyLookupParams,
  RequestAccessKeyLookupResult,
} from '../application/nfe-access-key-lookup.types.js'
import { parseAccessKeyLookupRequest } from './nfe-access-key-lookups.schema.js'

const INVOICES_IMPORT_POLICY = { permission: 'invoices.import', scope: 'company' } as const
const INVOICES_READ_POLICY = { permission: 'invoices.read', scope: 'company' } as const

/** Bipar é rápido, mas cada chave nova gasta o orçamento da SEFAZ, que é da empresa. */
const REQUEST_RATE_LIMIT = { maxRequests: 60, store: 'memory', windowMs: 60_000 } as const

type Dependencies = {
  readonly getLookup: {
    execute(input: GetAccessKeyLookupParams): Promise<AccessKeyLookupView>
  }
  readonly requestLookup: {
    execute(input: RequestAccessKeyLookupParams): Promise<RequestAccessKeyLookupResult>
  }
}

type RequestInput = Omit<RequestAccessKeyLookupParams, 'context'>
type GetInput = Omit<GetAccessKeyLookupParams, 'context'>

export function createNfeAccessKeyLookupRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<RequestInput>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.requestLookup.execute({
          ...input,
          context: context.scope,
        })
        return serializeRequestResult(result)
      },
      method: 'POST',
      async parse({ correlationId, request }): Promise<RequestInput> {
        return { ...(await parseAccessKeyLookupRequest(request)), correlationId }
      },
      pathname: API_NFE_ACCESS_KEY_LOOKUPS_PATH,
      policy: INVOICES_IMPORT_POLICY,
      rateLimit: REQUEST_RATE_LIMIT,
    }),
    defineRoute<GetInput>({
      async handle({ context, input }): Promise<Response> {
        const lookup = await dependencies.getLookup.execute({ ...input, context: context.scope })
        return jsonResponse({ body: { data: lookup }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }): GetInput => ({ lookupId: pathParameters.id ?? '' }),
      pathname: `${API_NFE_ACCESS_KEY_LOOKUPS_PATH}/:id`,
      policy: INVOICES_READ_POLICY,
    }),
  ]
}

function serializeRequestResult(result: RequestAccessKeyLookupResult): Response {
  if (result.kind === 'created') return jsonResponse({ body: { data: result.lookup }, status: 201 })
  if (result.kind === 'found') {
    return jsonResponse({
      body: { data: { documentId: result.documentId, status: 'found' } },
      status: 200,
    })
  }
  return jsonResponse({ body: { data: result.lookup }, status: 200 })
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}
