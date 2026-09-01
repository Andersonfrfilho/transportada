/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 058 P2 (RF-5): **fora da árvore `/trips/:id`**, de propósito. A sugestão multi-veículo não
 * pertence a viagem nenhuma — ela existe justamente antes de as viagens existirem, e pendurá-la numa
 * viagem obrigaria a inventar uma para poder pedir a sugestão que decide quantas criar.
 */
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { HTTP_ERROR, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import {
  assertJsonContentType,
  parseJson,
  readBoundedRequestBody,
} from '../../shared/request-body.service.js'
import type {
  AcceptedMultiVehicleSuggestion,
  MultiVehicleSuggestionUseCase,
} from '../application/multi-vehicle-suggestion.port.js'
import type { RouteSuggestion } from '../application/route-suggestion.port.js'
import { createMultiVehicleSuggestionSchema } from './route-suggestion-request.schema.js'

const MULTI_VEHICLE_PATH = '/route-suggestions/multi-vehicle'
const MULTI_VEHICLE_SUGGESTION_PATH = '/route-suggestions/:suggestionId'
const MULTI_VEHICLE_ACCEPT_PATH = `${MULTI_VEHICLE_SUGGESTION_PATH}/accept`
const MULTI_VEHICLE_REJECT_PATH = `${MULTI_VEHICLE_SUGGESTION_PATH}/reject`

/** A mesma permissão da sugestão de viagem: pedir roteiro é escrever viagem, aqui e lá. */
const TRIP_MANAGE_POLICY = { permission: 'trip.manage', scope: 'company' } as const
const TRIP_READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const

type Dependencies = Readonly<{ multiVehicleSuggestions: MultiVehicleSuggestionUseCase }>

export function createMultiVehicleSuggestionRoutes(dependencies: Dependencies) {
  return [
    defineRoute<{
      readonly correlationId: string
      readonly documentIds: readonly string[]
      readonly seed?: number | undefined
      readonly solverTimeBudgetSeconds?: number | undefined
      readonly vehicleIds: readonly string[]
    }>({
      async handle({ context, input }): Promise<Response> {
        const suggestion = await dependencies.multiVehicleSuggestions.create({
          context: context.scope,
          ...input,
        })

        /** `202` pela mesma razão da sugestão de viagem: o solver roda no worker. */
        return jsonResponse({ body: { data: serializeSuggestion(suggestion) }, status: 202 })
      },
      method: 'POST',
      async parse({ correlationId, request }) {
        const body = await parseRequiredBody(request)

        return {
          correlationId,
          documentIds: body.nfeDocumentIds,
          ...(body.seed === undefined ? {} : { seed: body.seed }),
          ...(body.solverTimeBudgetSeconds === undefined
            ? {}
            : { solverTimeBudgetSeconds: body.solverTimeBudgetSeconds }),
          vehicleIds: body.vehicleIds,
        }
      },
      pathname: MULTI_VEHICLE_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
    defineRoute<{ readonly suggestionId: string }>({
      async handle({ context, input }): Promise<Response> {
        const suggestion = await dependencies.multiVehicleSuggestions.read({
          context: context.scope,
          suggestionId: input.suggestionId,
        })

        return jsonResponse({ body: { data: serializeSuggestion(suggestion) }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        suggestionId: parseUuidPathIdentifier(pathParameters.suggestionId ?? ''),
      }),
      pathname: MULTI_VEHICLE_SUGGESTION_PATH,
      policy: TRIP_READ_POLICY,
    }),
    defineRoute<{ readonly suggestionId: string }>({
      async handle({ context, input }): Promise<Response> {
        const accepted = await dependencies.multiVehicleSuggestions.accept({
          context: context.scope,
          suggestionId: input.suggestionId,
        })

        return jsonResponse({ body: { data: serializeAccepted(accepted) }, status: 200 })
      },
      method: 'POST',
      parse: ({ pathParameters }) => ({
        suggestionId: parseUuidPathIdentifier(pathParameters.suggestionId ?? ''),
      }),
      pathname: MULTI_VEHICLE_ACCEPT_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
    defineRoute<{ readonly suggestionId: string }>({
      async handle({ context, input }): Promise<Response> {
        const suggestion = await dependencies.multiVehicleSuggestions.reject({
          context: context.scope,
          suggestionId: input.suggestionId,
        })

        return jsonResponse({ body: { data: serializeSuggestion(suggestion) }, status: 200 })
      },
      method: 'POST',
      parse: ({ pathParameters }) => ({
        suggestionId: parseUuidPathIdentifier(pathParameters.suggestionId ?? ''),
      }),
      pathname: MULTI_VEHICLE_REJECT_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
  ]
}

/**
 * Aqui o corpo é **obrigatório**, ao contrário da sugestão de viagem: sem nota e sem veículo não há
 * pool, e um `POST` vazio criaria uma sugestão que não tem o que distribuir.
 */
async function parseRequiredBody(
  request: Request,
): Promise<ReturnType<typeof createMultiVehicleSuggestionSchema.parse>> {
  assertJsonContentType(request.headers.get('content-type'))
  const raw = await readBoundedRequestBody(request)
  const result = createMultiVehicleSuggestionSchema.safeParse(parseJson(raw))
  if (!result.success) throw new ApiError(HTTP_ERROR.invalidRequest)

  return result.data
}

/**
 * O aceite devolve **as viagens criadas** ao lado da sugestão: sem isso a tela teria de procurar,
 * numa lista de viagens, quais nasceram do clique que ela acabou de dar.
 */
function serializeAccepted(accepted: AcceptedMultiVehicleSuggestion): object {
  return {
    suggestion: serializeSuggestion(accepted.suggestion),
    trips: accepted.trips.map((trip) => ({
      documentCount: trip.documentCount,
      stopCount: trip.stopCount,
      tripId: trip.tripId,
      vehicleId: trip.vehicleId,
    })),
  }
}

function serializeSuggestion(suggestion: RouteSuggestion): object {
  return {
    assumptions: suggestion.assumptions,
    createdAt: suggestion.createdAt,
    decidedAt: suggestion.decidedAt,
    errorCode: suggestion.errorCode,
    estimatedCostAmount: suggestion.estimatedCostAmount,
    estimatedDistanceMeters: suggestion.estimatedDistanceMeters,
    estimatedDurationSeconds: suggestion.estimatedDurationSeconds,
    id: suggestion.id,
    seed: suggestion.seed,
    status: suggestion.status,
    stops: suggestion.stops,
    tripId: suggestion.tripId,
    truncated: suggestion.truncated,
    updatedAt: suggestion.updatedAt,
    vehicleId: suggestion.vehicleId,
  }
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}
