/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 148 T7: a fila de revisão das notas que não couberam. Escrever é `trip.manage` (quem monta a
 * viagem, o separador incluso); ler é `fleet.read`, como a viagem. `companyId` e autor vêm sempre do
 * contexto autenticado.
 */
import { z } from 'zod'

import {
  TRIP_DOCUMENT_REVIEW_STATUSES,
  type TripDocumentReviewStatus,
} from '../../database/trip-document-review.schema.js'
import {
  invalidRequest,
  parseOptionalBody,
  parseUuidPathIdentifier,
} from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { API_TRIPS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type {
  PreviewChangeParams,
  TripDocumentReviewPort,
} from '../application/trip-document-review.port.js'

const TRIP_MANAGE_POLICY = { permission: 'trip.manage', scope: 'company' } as const
const TRIP_READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const

export const TRIP_DOCUMENT_REVIEWS_PATH = '/trip-document-reviews'
const RELEASE_UNPLACED_PATH = `${API_TRIPS_PATH}/:id/cargo-layouts/:layoutId/release-unplaced`
const SWAP_SUGGESTIONS_PATH = `${TRIP_DOCUMENT_REVIEWS_PATH}/:id/swap-suggestions`
const MOVE_PREVIEW_PATH = `${TRIP_DOCUMENT_REVIEWS_PATH}/:id/move-preview`
const MOVE_PATH = `${TRIP_DOCUMENT_REVIEWS_PATH}/:id/move`
const SWAP_PATH = `${TRIP_DOCUMENT_REVIEWS_PATH}/:id/swap`

const EMPTY_BODY_SCHEMA = z.object({}).strict()
const PREVIEW_BODY_SCHEMA = z
  .object({ outTripDocumentId: z.uuid().optional(), targetTripId: z.uuid().optional() })
  .strict()
  .refine((body) => (body.outTripDocumentId === undefined) !== (body.targetTripId === undefined), {
    message: 'Send either targetTripId (move) or outTripDocumentId (swap)',
  })
const MOVE_BODY_SCHEMA = z.object({ targetTripId: z.uuid(), validatedLayoutId: z.uuid() }).strict()
const SWAP_BODY_SCHEMA = z
  .object({ outTripDocumentId: z.uuid(), validatedLayoutId: z.uuid() })
  .strict()
const LIST_QUERY_SCHEMA = z
  .object({
    status: z.enum(TRIP_DOCUMENT_REVIEW_STATUSES).default('pending'),
    tripId: z.uuid().optional(),
  })
  .strict()

export type TripDocumentReviewRoutesDependencies = {
  readonly reviews: TripDocumentReviewPort
}

type ReviewPathInput = { readonly correlationId: string; readonly reviewId: string }

function reviewPathInput(params: {
  readonly correlationId: string
  readonly pathParameters: Readonly<Record<string, string>>
}): ReviewPathInput {
  return {
    correlationId: params.correlationId,
    reviewId: parseUuidPathIdentifier(params.pathParameters.id ?? ''),
  }
}

function toPreviewChange(body: z.infer<typeof PREVIEW_BODY_SCHEMA>) {
  if (body.targetTripId !== undefined) return { targetTripId: body.targetTripId }
  if (body.outTripDocumentId !== undefined) return { outTripDocumentId: body.outTripDocumentId }
  throw invalidRequest()
}

function parseListQuery(url: URL): {
  readonly status: TripDocumentReviewStatus
  readonly tripId?: string
} {
  const parsed = LIST_QUERY_SCHEMA.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) throw invalidRequest()
  return {
    status: parsed.data.status,
    ...(parsed.data.tripId === undefined ? {} : { tripId: parsed.data.tripId }),
  }
}

export function createTripDocumentReviewRoutes(
  dependencies: TripDocumentReviewRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  const { reviews } = dependencies

  return [
    /** D10: o botão "Tirar do caminhão as N notas que não couberam". Repetir devolve as mesmas entradas. */
    defineRoute<{
      readonly correlationId: string
      readonly layoutId: string
      readonly tripId: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const result = await reviews.releaseUnplaced({
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          layoutId: input.layoutId,
          tripId: input.tripId,
          userId: context.scope.userId,
        })
        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        await parseOptionalBody(EMPTY_BODY_SCHEMA, request)
        return {
          correlationId,
          layoutId: parseUuidPathIdentifier(pathParameters.layoutId ?? ''),
          tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: RELEASE_UNPLACED_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
    defineRoute<{ readonly status: TripDocumentReviewStatus; readonly tripId?: string }>({
      async handle({ context, input }): Promise<Response> {
        const items = await reviews.list({ companyId: context.scope.companyId, ...input })
        return jsonResponse({ body: { data: items }, status: 200 })
      },
      method: 'GET',
      parse: ({ request }) => parseListQuery(new URL(request.url)),
      pathname: TRIP_DOCUMENT_REVIEWS_PATH,
      policy: TRIP_READ_POLICY,
    }),
    defineRoute<ReviewPathInput>({
      async handle({ context, input }): Promise<Response> {
        const suggestions = await reviews.listSwapSuggestions({
          companyId: context.scope.companyId,
          reviewId: input.reviewId,
        })
        return jsonResponse({ body: { data: suggestions }, status: 200 })
      },
      method: 'GET',
      parse: reviewPathInput,
      pathname: SWAP_SUGGESTIONS_PATH,
      policy: TRIP_READ_POLICY,
    }),
    /** A planta do destino com a nota (ou do caminhão com a troca); o polling é o de sempre. */
    defineRoute<ReviewPathInput & { readonly change: ReturnType<typeof toPreviewChange> }>({
      async handle({ context, input }): Promise<Response> {
        const preview = await reviews.previewChange({
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          reviewId: input.reviewId,
          ...input.change,
        } as PreviewChangeParams)
        return jsonResponse({ body: { data: preview }, status: 200 })
      },
      method: 'POST',
      async parse(params) {
        const body = await parseOptionalBody(PREVIEW_BODY_SCHEMA, params.request)
        return { ...reviewPathInput(params), change: toPreviewChange(body) }
      },
      pathname: MOVE_PREVIEW_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
    defineRoute<ReviewPathInput & z.infer<typeof MOVE_BODY_SCHEMA>>({
      async handle({ context, input }): Promise<Response> {
        const review = await reviews.move({
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          reviewId: input.reviewId,
          targetTripId: input.targetTripId,
          userId: context.scope.userId,
          validatedLayoutId: input.validatedLayoutId,
        })
        return jsonResponse({ body: { data: review }, status: 200 })
      },
      method: 'POST',
      async parse(params) {
        const body = await parseOptionalBody(MOVE_BODY_SCHEMA, params.request)
        return { ...reviewPathInput(params), ...body }
      },
      pathname: MOVE_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
    defineRoute<ReviewPathInput & z.infer<typeof SWAP_BODY_SCHEMA>>({
      async handle({ context, input }): Promise<Response> {
        const swapped = await reviews.swap({
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          outTripDocumentId: input.outTripDocumentId,
          reviewId: input.reviewId,
          userId: context.scope.userId,
          validatedLayoutId: input.validatedLayoutId,
        })
        return jsonResponse({ body: { data: swapped }, status: 200 })
      },
      method: 'POST',
      async parse(params) {
        const body = await parseOptionalBody(SWAP_BODY_SCHEMA, params.request)
        return { ...reviewPathInput(params), ...body }
      },
      pathname: SWAP_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
  ]
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}
