/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF1: `GET /trip-occurrences/:id`, o detalhe que a linha de `/ocorrencias` abre.
 *
 * ⚠️ **A permissão é a da listagem, `fleet.read`**, nunca `trip.read`: esta é do motorista e do
 * agregado, e servir o detalhe por ela abriria a eles toda ocorrência da empresa, com o telefone e o
 * e-mail de outro motorista (`test/separator-role.contract.test.ts` e a tabela de papéis em
 * `authorization.policy.ts`). `:id` é o mesmo id da listagem e das rotas `/:id/attachments` e
 * `/:id/case/*`. A resposta leva dado pessoal do motorista, então é `no-store`.
 */
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import type { ReadTripOccurrenceDetailUseCase } from '../application/read-trip-occurrence-detail.use-case.js'

const TRIP_OCCURRENCE_DETAIL_PATH = '/trip-occurrences/:id'
const TRIP_OCCURRENCE_DETAIL_POLICY = { permission: 'fleet.read', scope: 'company' } as const

export type TripOccurrenceDetailRoutesDependencies = {
  readonly readTripOccurrenceDetail: ReadTripOccurrenceDetailUseCase
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
    status: input.status,
  })
}

export function createTripOccurrenceDetailRoutes(
  dependencies: TripOccurrenceDetailRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<{ readonly occurrenceId: string }>({
      async handle({ context, input }): Promise<Response> {
        const detail = await dependencies.readTripOccurrenceDetail.execute({
          context: context.scope,
          occurrenceId: input.occurrenceId,
        })
        return jsonResponse({ body: { data: detail }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: TRIP_OCCURRENCE_DETAIL_PATH,
      policy: TRIP_OCCURRENCE_DETAIL_POLICY,
    }),
  ]
}
