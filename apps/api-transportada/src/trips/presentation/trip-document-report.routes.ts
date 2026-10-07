/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 253 RF1: `GET /trip-document-report`, uma linha por nota de viagem. Lê com a mesma
 * `TRIP_FIELD_READ_POLICY` das leituras de campo; o `amount` só sai com `trip.financials`. A resposta
 * leva nome e cidade de destinatário, então é `no-store`.
 */
import { defineRoute } from '../../http/router.service.js'
import { JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type {
  ListTripReportParams,
  ListTripReportResult,
  TripReportQuery,
} from '../domain/trip-report.types.js'
import { parseTripReportQuery } from './trip-report.schema.js'
import { TRIP_FIELD_READ_POLICY, TRIP_FINANCIALS_POLICY } from './trip.routes.js'

const TRIP_DOCUMENT_REPORT_PATH = '/trip-document-report'

export type TripDocumentReportRoutesDependencies = {
  readonly listTripReport: (params: ListTripReportParams) => Promise<ListTripReportResult>
}

export function createTripDocumentReportRoutes(
  dependencies: TripDocumentReportRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<TripReportQuery>({
      async handle({ context, input }): Promise<Response> {
        const report = await dependencies.listTripReport({
          canReadFinancials: context.scope.permissions.has(TRIP_FINANCIALS_POLICY.permission),
          companyId: context.scope.companyId,
          query: input,
        })
        return new Response(JSON.stringify(report), {
          headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ request }) => parseTripReportQuery(new URL(request.url)),
      pathname: TRIP_DOCUMENT_REPORT_PATH,
      policy: TRIP_FIELD_READ_POLICY,
    }),
  ]
}
