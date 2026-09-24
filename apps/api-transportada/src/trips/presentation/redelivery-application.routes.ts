/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T14b: `POST /trip-occurrences/:id/case/redelivery-application` (RF18/RF19). `:id` é o id
 * da ocorrência, no mesmo molde de `occurrence-case.routes.ts`. Sempre `200`: viagem despachada
 * entre o `GET` da proposta e este `POST` não é erro do cliente — a tratativa registra `refused` em
 * vez de fingir que reordenou (D9).
 */
import { parseOptionalBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import type { RedeliveryApplicationResult } from '../application/redelivery-application.use-case.js'
import { EMPTY_BODY_SCHEMA } from './occurrence-case.schema.js'

const OCCURRENCE_CASE_POLICY = { permission: 'occurrences.resolve', scope: 'company' } as const

const REDELIVERY_APPLICATION_PATH = '/trip-occurrences/:id/case/redelivery-application'

const REDELIVERY_APPLICATION_RATE_LIMIT = {
  maxRequests: 120,
  scope: 'trip-occurrence-case',
  store: 'postgres',
  windowSeconds: 300,
} as const

export type RedeliveryApplicationRoutesDependencies = {
  readonly redeliveryApplication: {
    readonly apply: (input: {
      readonly actorUserId: string
      readonly companyId: string
      readonly occurrenceId: string
    }) => Promise<RedeliveryApplicationResult>
  }
}

type RedeliveryApplicationPathInput = { readonly occurrenceId: string }

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
    status: input.status,
  })
}

export function createRedeliveryApplicationRoutes(
  dependencies: RedeliveryApplicationRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<RedeliveryApplicationPathInput>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.redeliveryApplication.apply({
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          occurrenceId: input.occurrenceId,
        })
        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        await parseOptionalBody(EMPTY_BODY_SCHEMA, request)
        return { occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? '') }
      },
      pathname: REDELIVERY_APPLICATION_PATH,
      policy: OCCURRENCE_CASE_POLICY,
      rateLimit: REDELIVERY_APPLICATION_RATE_LIMIT,
    }),
  ]
}
