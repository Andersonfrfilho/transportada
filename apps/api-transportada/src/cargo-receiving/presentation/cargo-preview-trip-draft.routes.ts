/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T5.1 (RF7): `GET /cargo-previews/:id/trip-drafts` — os roteiros do contratante como rascunho
 * de viagem. Leitura (`fleet.read`), sem query nem corpo: a empresa vem do contexto e nada aqui cria
 * viagem; o aceite é o do roteirizador (ADR-0044 §5).
 */
import { defineRoute } from '../../http/router.service.js'
import { parseUuidPathIdentifier, readListQuery } from '../../http/request-parsing.service.js'
import { API_CARGO_PREVIEW_TRIP_DRAFTS_PATH } from '../../shared/api.constant.js'
import type { GetCargoPreviewTripDraftsParams } from '../application/cargo-preview-request.types.js'
import type { CargoPreviewTripDrafts } from '../domain/cargo-preview-trip-draft.types.js'
import { CARGO_ARRIVAL_READ_POLICY, jsonResponse } from './cargo-arrival-http.support.js'

type WithoutContext<TParams> = Omit<TParams, 'context'>
const NO_QUERY_KEYS: ReadonlySet<string> = new Set()

export type CargoPreviewTripDraftRoutesDependencies = {
  readonly getTripDrafts: {
    execute(params: GetCargoPreviewTripDraftsParams): Promise<CargoPreviewTripDrafts>
  }
}

export function createCargoPreviewTripDraftRoutes(
  dependencies: CargoPreviewTripDraftRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<WithoutContext<GetCargoPreviewTripDraftsParams>>({
      async handle({ context, input }): Promise<Response> {
        const drafts = await dependencies.getTripDrafts.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: drafts }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters, request }) => {
        readListQuery(new URL(request.url), NO_QUERY_KEYS)
        return { previewId: parseUuidPathIdentifier(pathParameters.id ?? '') }
      },
      pathname: API_CARGO_PREVIEW_TRIP_DRAFTS_PATH,
      policy: CARGO_ARRIVAL_READ_POLICY,
    }),
  ]
}
