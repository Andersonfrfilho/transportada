/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T14a: `GET /trip-occurrences/:id/case/redelivery-proposal` (RF17). `:id` é o id da
 * ocorrência (`trip_document_occurrences.id`), no mesmo molde das outras rotas de
 * `occurrence-case.routes.ts` — mas esta lê a proposta direto do documento da ocorrência, sem
 * precisar de uma tratativa já aberta. Só leitura: nenhuma escrita em `trip_stops`/`trip_documents`.
 */
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import type { RedeliveryProposal } from '../domain/redelivery-proposal.policy.js'

const OCCURRENCE_CASE_POLICY = { permission: 'occurrences.resolve', scope: 'company' } as const

const REDELIVERY_PROPOSAL_PATH = '/trip-occurrences/:id/case/redelivery-proposal'

const REDELIVERY_PROPOSAL_RATE_LIMIT = {
  maxRequests: 120,
  scope: 'trip-occurrence-case',
  store: 'postgres',
  windowSeconds: 300,
} as const

export type RedeliveryProposalRoutesDependencies = {
  readonly redeliveryProposal: {
    readonly getProposal: (input: {
      readonly companyId: string
      readonly occurrenceId: string
    }) => Promise<RedeliveryProposal>
  }
}

type RedeliveryProposalPathInput = { readonly occurrenceId: string }

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
    status: input.status,
  })
}

export function createRedeliveryProposalRoutes(
  dependencies: RedeliveryProposalRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<RedeliveryProposalPathInput>({
      async handle({ context, input }): Promise<Response> {
        const proposal = await dependencies.redeliveryProposal.getProposal({
          companyId: context.scope.companyId,
          occurrenceId: input.occurrenceId,
        })
        return jsonResponse({ body: { data: proposal }, status: 200 })
      },
      method: 'GET',
      parse({ pathParameters }) {
        return Promise.resolve({
          occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        })
      },
      pathname: REDELIVERY_PROPOSAL_PATH,
      policy: OCCURRENCE_CASE_POLICY,
      rateLimit: REDELIVERY_PROPOSAL_RATE_LIMIT,
    }),
  ]
}
