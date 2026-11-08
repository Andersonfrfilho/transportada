/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import { API_NFE_XML_RECEIPTS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { NfeXmlReceiptView } from '../application/list-nfe-xml-receipts.use-case.js'

const INVOICES_READ_POLICY = { permission: 'invoices.read', scope: 'company' } as const
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

type ListInput = { readonly limit: number }

export function createNfeXmlReceiptRoutes(dependencies: {
  readonly listReceipts: {
    execute(input: {
      readonly companyId: string
      readonly limit: number
    }): Promise<readonly NfeXmlReceiptView[]>
  }
}): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<ListInput>({
      async handle({ context, input }): Promise<Response> {
        const scope: CompanyContext = context.scope
        const data = await dependencies.listReceipts.execute({
          companyId: scope.companyId,
          limit: input.limit,
        })
        return new Response(JSON.stringify({ data }), {
          headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ request }): ListInput => {
        const raw = new URL(request.url).searchParams.get('limit')
        const parsed = raw === null ? DEFAULT_LIMIT : Number(raw)
        const limit =
          Number.isInteger(parsed) && parsed >= 1 ? Math.min(parsed, MAX_LIMIT) : DEFAULT_LIMIT
        return { limit }
      },
      pathname: API_NFE_XML_RECEIPTS_PATH,
      policy: INVOICES_READ_POLICY,
    }),
  ]
}
