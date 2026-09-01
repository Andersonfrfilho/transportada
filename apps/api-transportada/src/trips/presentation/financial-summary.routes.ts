/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0049 §6: o acumulado mostra margem e o que se paga a cada agregado — é `trip.financials`, de
 * `company-admin` e `finance`.
 */
import { z } from 'zod'

import { defineRoute } from '../../http/router.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_FINANCIAL_RESULTS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import {
  FINANCIAL_SUMMARY_GROUPS,
  type FinancialSummary,
  type FinancialSummaryGroup,
} from '../domain/financial-summary.policy.js'

const FINANCIALS_POLICY = { permission: 'trip.financials', scope: 'company' } as const
const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u

export type FinancialSummaryRoutesDependencies = {
  readonly readSummary: {
    execute(input: {
      readonly context: CompanyContext
      readonly from: string
      readonly groupBy: FinancialSummaryGroup
      readonly to: string
    }): Promise<FinancialSummary>
  }
}

export function createFinancialSummaryRoutes(
  dependencies: FinancialSummaryRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<{
      readonly from: string
      readonly groupBy: FinancialSummaryGroup
      readonly to: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const summary = await dependencies.readSummary.execute({
          context: context.scope,
          from: input.from,
          groupBy: input.groupBy,
          to: input.to,
        })

        return jsonResponse({ body: { data: summary }, status: 200 })
      },
      method: 'GET',
      parse: ({ request }) => parseSummaryQuery(new URL(request.url)),
      pathname: API_FINANCIAL_RESULTS_PATH,
      policy: FINANCIALS_POLICY,
    }),
  ]
}

/** A janela é obrigatória: acumulado sem período é varredura da base inteira com cara de relatório. */
function parseSummaryQuery(url: URL): {
  readonly from: string
  readonly groupBy: FinancialSummaryGroup
  readonly to: string
} {
  const parameters = url.searchParams

  return z
    .object({
      from: z.string().regex(DATE_PATTERN),
      groupBy: z.enum(FINANCIAL_SUMMARY_GROUPS).default('period'),
      to: z.string().regex(DATE_PATTERN),
    })
    .strict()
    .refine((query) => query.from <= query.to, {
      message: 'The period must start before it ends',
      path: ['to'],
    })
    .parse({
      from: parameters.get('from') ?? '',
      ...(parameters.get('groupBy') === null ? {} : { groupBy: parameters.get('groupBy') }),
      to: parameters.get('to') ?? '',
    })
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}
