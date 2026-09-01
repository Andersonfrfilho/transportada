/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ZodType } from 'zod'

import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { API_TRIPS_PATH, HTTP_ERROR, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import {
  assertJsonContentType,
  parseJson,
  readBoundedRequestBody,
} from '../../shared/request-body.service.js'
import type {
  CorrectedGeocodedAddress,
  GeocodedAddressCorrectionUseCase,
  RouteSuggestion,
  RouteSuggestionUseCase,
} from '../application/route-suggestion.port.js'
import {
  correctGeocodedAddressSchema,
  createRouteSuggestionSchema,
  rejectRouteSuggestionSchema,
} from './route-suggestion-request.schema.js'

/**
 * A escrita de roteiro é escrita de viagem: quem pode reordenar parada pode pedir e aceitar
 * sugestão. Uma permissão própria aqui separaria duas metades da mesma decisão.
 */
const TRIP_MANAGE_POLICY = { permission: 'trip.manage', scope: 'company' } as const
const TRIP_READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const

const ROUTE_SUGGESTIONS_PATH = `${API_TRIPS_PATH}/:id/route-suggestions`
const ROUTE_SUGGESTION_PATH = `${ROUTE_SUGGESTIONS_PATH}/:suggestionId`
const ROUTE_SUGGESTION_ACCEPT_PATH = `${ROUTE_SUGGESTION_PATH}/accept`
const ROUTE_SUGGESTION_REJECT_PATH = `${ROUTE_SUGGESTION_PATH}/reject`
/**
 * Fora da árvore `/trips/:id` de propósito: corrigir o pino conserta o endereço para **todas** as
 * viagens, presentes e futuras (ADR-0044 §3). Pendurá-la numa viagem sugeriria um efeito local que
 * ela não tem.
 */
const GEOCODED_ADDRESS_PATH = '/geocoded-addresses/:addressKey'
/**
 * ⚠️ **Desvio do plano, com motivo.** Ele previa
 * `POST /route-suggestions/:id/stops/:stopId/refine-address`. A marca é sobre o **endereço**, não
 * sobre a parada de uma sugestão: a coordenada é compartilhada, e o pino manual (degrau 3) já mora
 * em `/geocoded-addresses/:addressKey`. Pendurar o degrau 2 noutra árvore separaria dois degraus da
 * mesma escada e obrigaria a carregar uma sugestão que a operação não usa.
 */
const GEOCODED_ADDRESS_REFINE_PATH = `${GEOCODED_ADDRESS_PATH}/refine`

type RefineAddressUseCase = Readonly<{
  refine: (input: {
    readonly actorUserId: string
    readonly addressKey: string
    readonly companyId: string
  }) => Promise<{
    readonly latitude?: string
    readonly longitude?: string
    readonly outcome: 'refined' | 'not_improved' | 'provider_not_configured'
    readonly precision?: string
  }>
}>

type RefinementQuota = Readonly<{
  countInWindow: (input: { readonly companyId: string }) => Promise<number>
  limit: number
}>

type Dependencies = Readonly<{
  geocodedAddressCorrection: GeocodedAddressCorrectionUseCase
  refineAddress: RefineAddressUseCase
  refinementQuota: RefinementQuota
  routeSuggestions: RouteSuggestionUseCase
}>

export function createRouteSuggestionRoutes(dependencies: Dependencies) {
  return [
    defineRoute<{
      readonly correlationId: string
      readonly seed?: number | undefined
      readonly solverTimeBudgetSeconds?: number | undefined
      readonly tripId: string
      readonly vehicleIds?: readonly string[] | undefined
    }>({
      async handle({ context, input }): Promise<Response> {
        const suggestion = await dependencies.routeSuggestions.create({
          context: context.scope,
          ...input,
        })
        /**
         * `202`, não `201`: a sugestão foi aceita para processamento, não produzida. O solver roda
         * no worker (ADR-0044 §7), e a tela acompanha por poll.
         */
        return jsonResponse({ body: { data: serializeSuggestion(suggestion) }, status: 202 })
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        const body = await parseOptionalBody(request, createRouteSuggestionSchema)
        return { correlationId, tripId: parseUuidPathIdentifier(pathParameters.id ?? ''), ...body }
      },
      pathname: ROUTE_SUGGESTIONS_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
    defineRoute<{ readonly suggestionId: string; readonly tripId: string }>({
      async handle({ context, input }): Promise<Response> {
        const suggestion = await dependencies.routeSuggestions.read({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeSuggestion(suggestion) }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        suggestionId: parseUuidPathIdentifier(pathParameters.suggestionId ?? ''),
        tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: ROUTE_SUGGESTION_PATH,
      policy: TRIP_READ_POLICY,
    }),
    defineRoute<{ readonly suggestionId: string; readonly tripId: string }>({
      async handle({ context, input }): Promise<Response> {
        const suggestion = await dependencies.routeSuggestions.accept({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeSuggestion(suggestion) }, status: 200 })
      },
      method: 'POST',
      parse: ({ pathParameters }) => ({
        suggestionId: parseUuidPathIdentifier(pathParameters.suggestionId ?? ''),
        tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: ROUTE_SUGGESTION_ACCEPT_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
    defineRoute<{
      readonly reason?: string | undefined
      readonly suggestionId: string
      readonly tripId: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const suggestion = await dependencies.routeSuggestions.reject({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeSuggestion(suggestion) }, status: 200 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const body = await parseOptionalBody(request, rejectRouteSuggestionSchema)
        return {
          suggestionId: parseUuidPathIdentifier(pathParameters.suggestionId ?? ''),
          tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          ...body,
        }
      },
      pathname: ROUTE_SUGGESTION_REJECT_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
    defineRoute<{
      readonly addressKey: string
      readonly latitude: string
      readonly longitude: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const corrected = await dependencies.geocodedAddressCorrection.correct({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeAddress(corrected) }, status: 200 })
      },
      method: 'PATCH',
      async parse({ pathParameters, request }) {
        const body = await parseRequiredBody(request, correctGeocodedAddressSchema)
        return { addressKey: parseAddressKey(pathParameters.addressKey ?? ''), ...body }
      },
      pathname: GEOCODED_ADDRESS_PATH,
      /**
       * A chave não é UUID: ela é `cityCode|postalCode|number`, e o formato padrão do roteador
       * recusaria o caminho com 404 antes de qualquer validação nossa. `raw` já a decodifica.
       */
      pathParameterFormat: 'raw',
      policy: TRIP_MANAGE_POLICY,
    }),
    defineRoute<{ readonly addressKey: string }>({
      /**
       * O degrau 2 da escada (adendo 2026-09-01 da ADR-0044). **Nunca `204` mudo:** o conferente
       * marcou porque quer saber, e sem resposta ele conclui que a marca não funciona e para de
       * usá-la. As três saídas são `refined`, `not_improved` e `provider_not_configured` — as duas
       * últimas oferecem o degrau 3, o pino manual.
       */
      async handle({ context, input }): Promise<Response> {
        /**
         * RF11: a marca gasta, e `geocoded_addresses` não tem tenant — o endereço que uma empresa
         * manda reconsultar é reconsultado para todas. Sem teto, um laço de tela chama o provedor
         * pago em série.
         */
        const used = await dependencies.refinementQuota.countInWindow({
          companyId: context.scope.companyId,
        })
        if (used >= dependencies.refinementQuota.limit) {
          return jsonResponse({
            body: {
              error: {
                code: 'GEOCODING_REFINEMENT_QUOTA_EXCEEDED',
                message: 'Too many address refinements in this window',
              },
            },
            status: 429,
          })
        }

        const result = await dependencies.refineAddress.refine({
          actorUserId: context.scope.userId,
          addressKey: input.addressKey,
          companyId: context.scope.companyId,
        })

        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'POST',
      parse: ({ pathParameters }) => ({
        addressKey: parseAddressKey(pathParameters.addressKey ?? ''),
      }),
      pathname: GEOCODED_ADDRESS_REFINE_PATH,
      pathParameterFormat: 'raw',
      policy: TRIP_MANAGE_POLICY,
    }),
  ]
}

/**
 * A chave carrega `|` — ela é `cityCode|postalCode|number`, e o cliente a manda codificada; o
 * roteador a decodifica. Rejeitar aqui o que não tem a forma da chave evita procurar no banco por
 * lixo, e é o que devolve `400` em vez de `404` para chave malformada.
 */
const ADDRESS_KEY_PATTERN = /^[0-9]*\|[0-9]{8}\|[^|]{1,60}$/u

function parseAddressKey(addressKey: string): string {
  if (!ADDRESS_KEY_PATTERN.test(addressKey)) throw new ApiError(HTTP_ERROR.invalidRequest)

  return addressKey
}

/**
 * Corpo ausente é o caso normal aqui: pedir sugestão para uma viagem não precisa de nada além dela.
 * `readBoundedRequestBody` lança quando não há corpo — por isso a ausência é checada **antes** de
 * ler, e não capturada depois: um corpo grande demais também lançaria, e engolir os dois juntos
 * transformaria uma recusa por tamanho num pedido silenciosamente vazio.
 */
async function parseOptionalBody<TOutput>(
  request: Request,
  schema: ZodType<TOutput>,
): Promise<Partial<TOutput>> {
  if (request.body === null) return {}

  const raw = await readBoundedRequestBody(request)
  if (raw.trim() === '') return {}

  assertJsonContentType(request.headers.get('content-type'))
  const result = schema.safeParse(parseJson(raw))
  if (!result.success) throw new ApiError(HTTP_ERROR.invalidRequest)

  return result.data
}

async function parseRequiredBody<TOutput>(
  request: Request,
  schema: ZodType<TOutput>,
): Promise<TOutput> {
  assertJsonContentType(request.headers.get('content-type'))
  const raw = await readBoundedRequestBody(request)
  const result = schema.safeParse(parseJson(raw))
  if (!result.success) throw new ApiError(HTTP_ERROR.invalidRequest)

  return result.data
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
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

function serializeAddress(address: CorrectedGeocodedAddress): object {
  return {
    addressKey: address.addressKey,
    latitude: address.latitude,
    longitude: address.longitude,
    precision: address.precision,
    source: address.source,
  }
}
