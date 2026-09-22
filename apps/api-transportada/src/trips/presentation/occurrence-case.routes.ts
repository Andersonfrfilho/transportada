/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T7: as cinco rotas internas da tratativa (RF5-RF8, mais `cancel` — o estado terminal
 * nasceu na T2 sem rota até esta task fechar a lacuna). `:id` é o id da **ocorrência**
 * (`trip_document_occurrences.id`), nunca o `caseId` — a rota resolve um pelo outro antes de chamar
 * o caso de uso (T5). Ocorrência de outra empresa, ou sem tratativa aberta, é `404`; corrida perdida
 * entre duas transições concorrentes já responde `409` de dentro do repositório (T4); repetir a
 * mesma ação converge (`kind: 'unchanged'`), nunca estoura.
 */
import { parseOptionalBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import type { OccurrenceCaseUseCase } from '../application/occurrence-case.use-case.js'
import { OccurrenceCaseNotFoundError } from '../domain/trip.error.js'
import {
  EMPTY_BODY_SCHEMA,
  OPTIONAL_NOTE_BODY_SCHEMA,
  REQUIRED_NOTE_BODY_SCHEMA,
} from './occurrence-case.schema.js'

const OCCURRENCE_CASE_POLICY = { permission: 'occurrences.resolve', scope: 'company' } as const

const TRIP_OCCURRENCE_FEED_PATH = '/trip-occurrences'
const OCCURRENCE_CASE_BASE_PATH = `${TRIP_OCCURRENCE_FEED_PATH}/:id/case`
const OCCURRENCE_CASE_REVIEW_PATH = `${OCCURRENCE_CASE_BASE_PATH}/review`
const OCCURRENCE_CASE_WAREHOUSE_RETURN_PATH = `${OCCURRENCE_CASE_BASE_PATH}/warehouse-return`
const OCCURRENCE_CASE_CONTRACTOR_SUBMISSION_PATH = `${OCCURRENCE_CASE_BASE_PATH}/contractor-submission`
const OCCURRENCE_CASE_CLOSURE_PATH = `${OCCURRENCE_CASE_BASE_PATH}/closure`
const OCCURRENCE_CASE_CANCEL_PATH = `${OCCURRENCE_CASE_BASE_PATH}/cancel`

/**
 * Um balde só para as cinco: são transições de estado do escritório, não um alvo de custo externo
 * nem um lote — o mesmo teto de `trip-field-office-trip` (viagem/parada do escritório).
 */
const OCCURRENCE_CASE_RATE_LIMIT = {
  maxRequests: 120,
  scope: 'trip-occurrence-case',
  store: 'postgres',
  windowSeconds: 300,
} as const

export type OccurrenceCaseRoutesDependencies = {
  readonly findCaseIdByOccurrenceId: (input: {
    readonly companyId: string
    readonly occurrenceId: string
  }) => Promise<string | null>
  readonly occurrenceCase: OccurrenceCaseUseCase
}

type OccurrenceCasePathInput = { readonly note?: string; readonly occurrenceId: string }

async function resolveCaseId(
  dependencies: OccurrenceCaseRoutesDependencies,
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

export function createOccurrenceCaseRoutes(
  dependencies: OccurrenceCaseRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<OccurrenceCasePathInput>({
      async handle({ context, input }): Promise<Response> {
        const caseId = await resolveCaseId(dependencies, {
          companyId: context.scope.companyId,
          occurrenceId: input.occurrenceId,
        })
        const result = await dependencies.occurrenceCase.review({ caseId, context: context.scope })
        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        await parseOptionalBody(EMPTY_BODY_SCHEMA, request)
        return { occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? '') }
      },
      pathname: OCCURRENCE_CASE_REVIEW_PATH,
      policy: OCCURRENCE_CASE_POLICY,
      rateLimit: OCCURRENCE_CASE_RATE_LIMIT,
    }),
    /** RF6: nota obrigatória — o CHECK do banco já exige, e o caso de uso barra antes do banco (T5). */
    defineRoute<OccurrenceCasePathInput>({
      async handle({ context, input }): Promise<Response> {
        const caseId = await resolveCaseId(dependencies, {
          companyId: context.scope.companyId,
          occurrenceId: input.occurrenceId,
        })
        const result = await dependencies.occurrenceCase.warehouseReturn({
          caseId,
          context: context.scope,
          ...(input.note === undefined ? {} : { note: input.note }),
        })
        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const body = await parseOptionalBody(REQUIRED_NOTE_BODY_SCHEMA, request)
        return { note: body.note, occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? '') }
      },
      pathname: OCCURRENCE_CASE_WAREHOUSE_RETURN_PATH,
      policy: OCCURRENCE_CASE_POLICY,
      rateLimit: OCCURRENCE_CASE_RATE_LIMIT,
    }),
    defineRoute<OccurrenceCasePathInput>({
      async handle({ context, input }): Promise<Response> {
        const caseId = await resolveCaseId(dependencies, {
          companyId: context.scope.companyId,
          occurrenceId: input.occurrenceId,
        })
        const result = await dependencies.occurrenceCase.contractorSubmission({
          caseId,
          context: context.scope,
        })
        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        await parseOptionalBody(OPTIONAL_NOTE_BODY_SCHEMA, request)
        return { occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? '') }
      },
      pathname: OCCURRENCE_CASE_CONTRACTOR_SUBMISSION_PATH,
      policy: OCCURRENCE_CASE_POLICY,
      rateLimit: OCCURRENCE_CASE_RATE_LIMIT,
    }),
    /** RF8: só sai de `decided` — a máquina (dentro do repositório, T4) reprova o resto com 409. */
    defineRoute<OccurrenceCasePathInput>({
      async handle({ context, input }): Promise<Response> {
        const caseId = await resolveCaseId(dependencies, {
          companyId: context.scope.companyId,
          occurrenceId: input.occurrenceId,
        })
        const result = await dependencies.occurrenceCase.closure({ caseId, context: context.scope })
        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        await parseOptionalBody(OPTIONAL_NOTE_BODY_SCHEMA, request)
        return { occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? '') }
      },
      pathname: OCCURRENCE_CASE_CLOSURE_PATH,
      policy: OCCURRENCE_CASE_POLICY,
      rateLimit: OCCURRENCE_CASE_RATE_LIMIT,
    }),
    /**
     * Nasceu de uma decisão do usuário posterior à spec.md: ocorrência aberta por engano precisa de
     * um fim próprio. Só sai de `recorded`/`under_review` (T2); depois de enviada ao contratante, a
     * máquina recusa com 409. Nota obrigatória — o CHECK do banco já exige.
     */
    defineRoute<OccurrenceCasePathInput>({
      async handle({ context, input }): Promise<Response> {
        const caseId = await resolveCaseId(dependencies, {
          companyId: context.scope.companyId,
          occurrenceId: input.occurrenceId,
        })
        const result = await dependencies.occurrenceCase.cancel({
          caseId,
          context: context.scope,
          ...(input.note === undefined ? {} : { note: input.note }),
        })
        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const body = await parseOptionalBody(REQUIRED_NOTE_BODY_SCHEMA, request)
        return { note: body.note, occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? '') }
      },
      pathname: OCCURRENCE_CASE_CANCEL_PATH,
      policy: OCCURRENCE_CASE_POLICY,
      rateLimit: OCCURRENCE_CASE_RATE_LIMIT,
    }),
  ]
}
