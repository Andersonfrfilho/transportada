/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 327: gasto × custo da viagem. Dinheiro por viagem — `trip.financials`, como o resultado congelado.
 */
import { z } from 'zod'

import { defineRoute } from '../../http/router.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_TRIPS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { CrewCostComparisonPage } from '../application/read-crew-cost-comparison.use-case.js'

const FINANCIALS_POLICY = { permission: 'trip.financials', scope: 'company' } as const
const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u

export type CrewCostComparisonRoutesDependencies = {
  readonly readComparison: {
    execute(input: {
      readonly companyId: string
      readonly from: string
      readonly to: string
    }): Promise<CrewCostComparisonPage>
  }
}

export const API_CREW_COST_COMPARISON_PATH = `${API_TRIPS_PATH}/crew-cost-comparison`

export function createCrewCostComparisonRoutes(
  dependencies: CrewCostComparisonRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<{ readonly from: string; readonly to: string }>({
      async handle({ context, input }): Promise<Response> {
        const scope: CompanyContext = context.scope
        const page = await dependencies.readComparison.execute({
          companyId: scope.companyId,
          from: input.from,
          to: input.to,
        })

        return new Response(JSON.stringify({ data: page }), {
          headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ request }) => parseQuery(new URL(request.url)),
      pathname: API_CREW_COST_COMPARISON_PATH,
      policy: FINANCIALS_POLICY,
    }),
  ]
}

/** Janela obrigatória: comparação sem período varre a base inteira. */
function parseQuery(url: URL): { readonly from: string; readonly to: string } {
  return z
    .object({ from: z.string().regex(DATE_PATTERN), to: z.string().regex(DATE_PATTERN) })
    .strict()
    .refine((query) => isRealDate(query.from) && isRealDate(query.to), {
      message: 'The date must exist in the calendar',
      path: ['from'],
    })
    .refine((query) => query.from <= query.to, {
      message: 'The period must start before it ends',
      path: ['to'],
    })
    .parse({ from: url.searchParams.get('from') ?? '', to: url.searchParams.get('to') ?? '' })
}

/** `2026-02-31` casa o formato, mas não existe — sem isto vira erro do Postgres (500) em vez de 400. */
function isRealDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`)

  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
}
