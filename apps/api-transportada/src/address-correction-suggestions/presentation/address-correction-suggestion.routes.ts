/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * `trip.manage`, a permissão do `PATCH /geocoded-addresses/:addressKey`: aplicar uma sugestão é a mesma
 * correção de coordenada, só que com o ponto que o motorista mandou.
 */
import { defineRoute } from '../../http/router.service.js'
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import {
  API_ADDRESS_CORRECTION_SUGGESTION_APPLY_PATH,
  API_ADDRESS_CORRECTION_SUGGESTION_DISMISS_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type { AddressCorrectionSuggestionDecisionPort } from '../application/address-correction-suggestion.port.js'

const TRIP_MANAGE_POLICY = { permission: 'trip.manage', scope: 'company' } as const

type DecisionInput = { readonly correlationId: string; readonly suggestionId: string }

type Dependencies = {
  readonly decisions: AddressCorrectionSuggestionDecisionPort
}

export function createAddressCorrectionSuggestionRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return (['apply', 'dismiss'] as const).map((verb) =>
    defineRoute<DecisionInput>({
      async handle({ context, input }): Promise<Response> {
        const decided = await dependencies.decisions[verb]({
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          ...input,
        })
        return new Response(JSON.stringify({ data: { id: decided.id, status: decided.status } }), {
          headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
          status: 200,
        })
      },
      method: 'POST',
      parse: ({ correlationId, pathParameters }) => ({
        correlationId,
        suggestionId: parseUuidPathIdentifier(pathParameters.suggestionId ?? ''),
      }),
      pathname:
        verb === 'apply'
          ? API_ADDRESS_CORRECTION_SUGGESTION_APPLY_PATH
          : API_ADDRESS_CORRECTION_SUGGESTION_DISMISS_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
  )
}
