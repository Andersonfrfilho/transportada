/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T13/T18: as duas rotas do acerto por item. `:id` é o id da **ocorrência**
 * (`trip_document_occurrences.id`), no mesmo molde de `occurrence-case.routes.ts` (T7) — a rota
 * resolve `occurrenceId → caseId` antes de chamar o caso de uso, e ocorrência sem tratativa ou de
 * outra empresa é 404.
 */
import { parseBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import type { RecordOccurrenceSettlementUseCase } from '../application/record-occurrence-settlement.use-case.js'
import type { ReimburseOccurrenceSettlementUseCase } from '../application/reimburse-occurrence-settlement.use-case.js'
import { OccurrenceCaseNotFoundError } from '../domain/trip.error.js'
import {
  RECORD_SETTLEMENT_BODY_SCHEMA,
  REIMBURSE_SETTLEMENT_BODY_SCHEMA,
} from './occurrence-settlement.schema.js'
import type { RecordSettlementBody } from './occurrence-settlement.schema.js'

const OCCURRENCE_SETTLEMENT_POLICY = {
  permission: 'occurrences.resolve',
  scope: 'company',
} as const

const TRIP_OCCURRENCE_FEED_PATH = '/trip-occurrences'
const OCCURRENCE_SETTLEMENT_PATH = `${TRIP_OCCURRENCE_FEED_PATH}/:id/case/settlement`
const OCCURRENCE_SETTLEMENT_REIMBURSEMENT_PATH = `${OCCURRENCE_SETTLEMENT_PATH}/reimbursement`

/** Mesmo teto de `occurrence-case.routes.ts` (T7) — transições do escritório, não custo externo. */
const OCCURRENCE_SETTLEMENT_RATE_LIMIT = {
  maxRequests: 120,
  scope: 'trip-occurrence-settlement',
  store: 'postgres',
  windowSeconds: 300,
} as const

export type OccurrenceSettlementRoutesDependencies = {
  readonly findCaseIdByOccurrenceId: (input: {
    readonly companyId: string
    readonly occurrenceId: string
  }) => Promise<string | null>
  readonly settlement: RecordOccurrenceSettlementUseCase
  readonly settlementReimbursement: ReimburseOccurrenceSettlementUseCase
}

async function resolveCaseId(
  dependencies: OccurrenceSettlementRoutesDependencies,
  input: { readonly companyId: string; readonly occurrenceId: string },
): Promise<string> {
  const caseId = await dependencies.findCaseIdByOccurrenceId(input)
  if (caseId === null) throw new OccurrenceCaseNotFoundError()
  return caseId
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
    status: input.status,
  })
}

type RecordSettlementPathInput = {
  readonly items: RecordSettlementBody['items']
  readonly occurrenceId: string
}

type ReimburseSettlementPathInput = { readonly occurrenceId: string; readonly productCode: string }

export function createOccurrenceSettlementRoutes(
  dependencies: OccurrenceSettlementRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    /** T13 (RF23/CA9/CA9b): substitui a lista inteira — a soma e a ponte para `delivery_charges`
     * (T17) acontecem na mesma transação, dentro do repositório. */
    defineRoute<RecordSettlementPathInput>({
      async handle({ context, input }): Promise<Response> {
        const caseId = await resolveCaseId(dependencies, {
          companyId: context.scope.companyId,
          occurrenceId: input.occurrenceId,
        })
        const result = await dependencies.settlement.record({
          caseId,
          context: context.scope,
          items: input.items,
        })
        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'PUT',
      async parse({ pathParameters, request }) {
        const body = await parseBody(RECORD_SETTLEMENT_BODY_SCHEMA, request)
        return {
          items: body.items,
          occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: OCCURRENCE_SETTLEMENT_PATH,
      policy: OCCURRENCE_SETTLEMENT_POLICY,
      rateLimit: OCCURRENCE_SETTLEMENT_RATE_LIMIT,
    }),
    /** T18 (RF31/CA9e): idempotente; recusa `payer_kind = 'carrier'` antes de tocar o banco. */
    defineRoute<ReimburseSettlementPathInput>({
      async handle({ context, input }): Promise<Response> {
        const caseId = await resolveCaseId(dependencies, {
          companyId: context.scope.companyId,
          occurrenceId: input.occurrenceId,
        })
        const result = await dependencies.settlementReimbursement.reimburse({
          caseId,
          context: context.scope,
          productCode: input.productCode,
        })
        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const body = await parseBody(REIMBURSE_SETTLEMENT_BODY_SCHEMA, request)
        return {
          occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          productCode: body.productCode,
        }
      },
      pathname: OCCURRENCE_SETTLEMENT_REIMBURSEMENT_PATH,
      policy: OCCURRENCE_SETTLEMENT_POLICY,
      rateLimit: OCCURRENCE_SETTLEMENT_RATE_LIMIT,
    }),
  ]
}
