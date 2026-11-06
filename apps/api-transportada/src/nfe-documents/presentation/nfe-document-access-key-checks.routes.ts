/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import {
  API_NFE_DOCUMENT_ACCESS_KEY_CHECKS_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type {
  AccessKeyCheckEntry,
  CheckAccessKeysParams,
} from '../application/nfe-document-access-key-check.types.js'
import { parseAccessKeyCheckRequest } from './nfe-document-access-key-checks.schema.js'

const INVOICES_READ_POLICY = { permission: 'invoices.read', scope: 'company' } as const

/** Mesmo teto da busca por chave: cada chamada paga uma consulta de até 200 chaves. */
const CHECK_RATE_LIMIT = { maxRequests: 60, store: 'memory', windowMs: 60_000 } as const

type Dependencies = {
  readonly checkAccessKeys: {
    execute(input: CheckAccessKeysParams): Promise<readonly AccessKeyCheckEntry[]>
  }
}

type CheckInput = Omit<CheckAccessKeysParams, 'context'>

export function createNfeDocumentAccessKeyCheckRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<CheckInput>({
      async handle({ context, input }): Promise<Response> {
        const entries = await dependencies.checkAccessKeys.execute({
          ...input,
          context: context.scope,
        })
        return new Response(JSON.stringify({ data: entries }), {
          headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
          status: 200,
        })
      },
      method: 'POST',
      parse: ({ request }): Promise<CheckInput> => parseAccessKeyCheckRequest(request),
      pathname: API_NFE_DOCUMENT_ACCESS_KEY_CHECKS_PATH,
      policy: INVOICES_READ_POLICY,
      rateLimit: CHECK_RATE_LIMIT,
    }),
  ]
}
