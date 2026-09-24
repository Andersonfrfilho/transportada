/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T19: `trip.financials` — dinheiro tem permissão própria (spec 061 D4); quem valida
 * ocorrência não vê valor por carona.
 *
 * Revisão de segurança da spec 164: `cursor` era repassado cru — não é injeção (Drizzle
 * parametriza), mas `?cursor=abc` virava erro de sintaxe do Postgres e saía como 500 em vez de 400.
 * `parseUuidFilter` é o mesmo validador que os outros filtros desta rota já usam.
 */
import { z } from 'zod'

import {
  DELIVERY_CHARGE_STATUSES,
  DELIVERY_CHARGE_TYPES,
} from '../../database/delivery-client.schema.js'
import { defineRoute } from '../../http/router.service.js'
import { parseUuidFilter } from '../../http/request-parsing.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_OCCURRENCE_CHARGES_REPORT_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type {
  OccurrenceChargeReportFilters,
  OccurrenceChargeReportPage,
} from '../application/occurrence-charge-report.port.js'

const REPORT_POLICY = { permission: 'trip.financials', scope: 'company' } as const

const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export type OccurrenceChargeReportRoutesDependencies = {
  readonly readReport: {
    execute(input: {
      readonly context: CompanyContext
      readonly filters: OccurrenceChargeReportFilters
    }): Promise<OccurrenceChargeReportPage>
  }
}

export function createOccurrenceChargeReportRoutes(
  dependencies: OccurrenceChargeReportRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<{ readonly filters: OccurrenceChargeReportFilters }>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.readReport.execute({
          context: context.scope,
          filters: input.filters,
        })

        return new Response(
          JSON.stringify({
            data: page.items,
            page: { nextCursor: page.nextCursor },
            totals: page.totals,
          }),
          {
            headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
            status: 200,
          },
        )
      },
      method: 'GET',
      parse: ({ request }) => ({ filters: parseReportFilters(new URL(request.url)) }),
      pathname: API_OCCURRENCE_CHARGES_REPORT_PATH,
      policy: REPORT_POLICY,
    }),
  ]
}

function parseReportFilters(url: URL): OccurrenceChargeReportFilters {
  const parameters = url.searchParams
  const chargeType = parameters.get('chargeType')
  const contractorId = parameters.get('contractorId')
  const cursor = parseUuidFilter(parameters.get('cursor'))
  const from = parameters.get('from')
  const hasSettlement = parameters.get('hasSettlement')
  const search = parameters.get('search')
  const status = parameters.get('status')
  const to = parameters.get('to')

  return {
    ...(chargeType === null ? {} : { chargeType: z.enum(DELIVERY_CHARGE_TYPES).parse(chargeType) }),
    ...(contractorId === null ? {} : { contractorId: z.string().uuid().parse(contractorId) }),
    ...(cursor === undefined ? {} : { cursor }),
    ...(from === null ? {} : { from: z.string().regex(DATE_PATTERN).parse(from) }),
    ...(hasSettlement === null
      ? {}
      : { hasSettlement: z.enum(['true', 'false']).parse(hasSettlement) === 'true' }),
    limit:
      parameters.get('limit') === null
        ? DEFAULT_LIMIT
        : z.coerce.number().int().min(1).max(MAX_LIMIT).parse(parameters.get('limit')),
    ...(search === null || search.trim().length === 0 ? {} : { search: search.trim() }),
    ...(status === null ? {} : { status: z.enum(DELIVERY_CHARGE_STATUSES).parse(status) }),
    ...(to === null ? {} : { to: z.string().regex(DATE_PATTERN).parse(to) }),
  }
}
