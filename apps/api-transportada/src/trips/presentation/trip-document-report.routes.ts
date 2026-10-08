/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 253 RF1: `GET /trip-document-report`, uma linha por nota de viagem. Lê com a mesma
 * `TRIP_FIELD_READ_POLICY` das leituras de campo; o `amount` só sai com `trip.financials`. A resposta
 * leva nome e cidade de destinatário, então é `no-store`. Spec 253 RF10-RF12: `.../proofs-pdf` entrega
 * os canhotos das mesmas notas, com o mesmo filtro, escopo e política de leitura.
 */
import { defineRoute } from '../../http/router.service.js'
import { JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type {
  ExportTripProofPdfParams,
  ExportTripProofPdfResult,
} from '../domain/trip-proof-report.types.js'
import type {
  ListTripReportParams,
  ListTripReportResult,
  TripReportQuery,
} from '../domain/trip-report.types.js'
import { parseTripReportQuery } from './trip-report.schema.js'
import { TRIP_FIELD_READ_POLICY, TRIP_FINANCIALS_POLICY } from './trip.routes.js'

const TRIP_DOCUMENT_REPORT_PATH = '/trip-document-report'
const TRIP_PROOF_PDF_PATH = '/trip-document-report/proofs-pdf'
const PDF_CONTENT_TYPE = 'application/pdf'

const REPORT_RATE_LIMIT = {
  maxRequests: 60,
  scope: 'trip-document-report',
  store: 'postgres',
  windowSeconds: 300,
} as const

/** O PDF lê até 200 imagens do storage por chamada: balde bem mais curto que o da lista. */
const PROOF_PDF_RATE_LIMIT = {
  maxRequests: 10,
  scope: 'trip-proof-pdf',
  store: 'postgres',
  windowSeconds: 300,
} as const

export type TripDocumentReportRoutesDependencies = {
  readonly exportTripProofPdf: (
    params: ExportTripProofPdfParams,
  ) => Promise<ExportTripProofPdfResult>
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
      rateLimit: REPORT_RATE_LIMIT,
    }),
    defineRoute<TripReportQuery>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.exportTripProofPdf({
          canReadFinancials: context.scope.permissions.has(TRIP_FINANCIALS_POLICY.permission),
          companyId: context.scope.companyId,
          exportedByUserId: context.scope.userId,
          filters: input.filters,
        })
        return new Response(result.stream, {
          headers: {
            'cache-control': 'no-store',
            'content-disposition': `attachment; filename="${result.filename}"`,
            'content-type': PDF_CONTENT_TYPE,
          },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ request }) => parseTripReportQuery(new URL(request.url)),
      pathname: TRIP_PROOF_PDF_PATH,
      policy: TRIP_FIELD_READ_POLICY,
      rateLimit: PROOF_PDF_RATE_LIMIT,
    }),
  ]
}
