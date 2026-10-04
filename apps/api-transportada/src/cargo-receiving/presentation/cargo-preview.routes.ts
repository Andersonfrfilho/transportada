/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.2: enviar (multipart, `trip.manage`) e ler (`fleet.read`) a prévia. O mesmo arquivo de
 * novo devolve a prévia existente com 200, nunca 201.
 */
import { defineRoute } from '../../http/router.service.js'
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { API_CARGO_PREVIEW_PATH, API_CARGO_PREVIEWS_PATH } from '../../shared/api.constant.js'
import type { Page } from '../application/cargo-arrival.types.js'
import type {
  GetCargoPreviewParams,
  ListCargoPreviewsParams,
  UploadCargoPreviewParams,
} from '../application/cargo-preview-request.types.js'
import type { CargoPreviewDetail, CargoPreviewSummary } from '../application/cargo-preview.types.js'
import type { UploadCargoPreviewResult } from '../application/upload-cargo-preview.use-case.js'
import {
  CARGO_ARRIVAL_MANAGE_POLICY,
  CARGO_ARRIVAL_READ_POLICY,
  jsonResponse,
} from './cargo-arrival-http.support.js'
import {
  parseCargoPreviewItemsQuery,
  parseListCargoPreviewsQuery,
  parseUploadCargoPreviewRequest,
} from './cargo-preview.schema.js'

type UseCase<TParams, TResult> = { execute(params: TParams): Promise<TResult> }
type WithoutContext<TParams> = Omit<TParams, 'context'>

export type CargoPreviewRoutesDependencies = {
  readonly getPreview: UseCase<GetCargoPreviewParams, CargoPreviewDetail>
  readonly listPreviews: UseCase<ListCargoPreviewsParams, Page<CargoPreviewSummary>>
  readonly uploadPreview: UseCase<UploadCargoPreviewParams, UploadCargoPreviewResult>
}

type Dependencies = CargoPreviewRoutesDependencies

/**
 * Revisão de segurança da Fase 4a (S5): cada envio é uma planilha que o worker vai abrir. Folga para
 * o dia cheio de um separador (as prévias reais são uma por dia por contratante).
 */
export const CARGO_PREVIEW_UPLOAD_RATE_LIMIT = {
  maxRequests: 20,
  scope: 'cargo-preview-upload',
  store: 'postgres',
  windowSeconds: 300,
} as const

export function createCargoPreviewRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [uploadRoute(dependencies), listRoute(dependencies), detailRoute(dependencies)]
}

function uploadRoute(dependencies: Dependencies): ReturnType<typeof defineRoute> {
  return defineRoute<WithoutContext<UploadCargoPreviewParams>>({
    async handle({ context, input }): Promise<Response> {
      const result = await dependencies.uploadPreview.execute({ context: context.scope, ...input })
      return jsonResponse({ body: { data: result.preview }, status: result.isReplay ? 200 : 201 })
    },
    method: 'POST',
    parse: async ({ correlationId, request }) => ({
      correlationId,
      ...(await parseUploadCargoPreviewRequest(request)),
    }),
    pathname: API_CARGO_PREVIEWS_PATH,
    policy: CARGO_ARRIVAL_MANAGE_POLICY,
    rateLimit: CARGO_PREVIEW_UPLOAD_RATE_LIMIT,
  })
}

function listRoute(dependencies: Dependencies): ReturnType<typeof defineRoute> {
  return defineRoute<WithoutContext<ListCargoPreviewsParams>>({
    async handle({ context, input }): Promise<Response> {
      const page = await dependencies.listPreviews.execute({ context: context.scope, ...input })
      return jsonResponse({ body: { data: page.items, nextCursor: page.nextCursor }, status: 200 })
    },
    method: 'GET',
    parse: ({ request }) => parseListCargoPreviewsQuery(new URL(request.url)),
    pathname: API_CARGO_PREVIEWS_PATH,
    policy: CARGO_ARRIVAL_READ_POLICY,
  })
}

function detailRoute(dependencies: Dependencies): ReturnType<typeof defineRoute> {
  return defineRoute<WithoutContext<GetCargoPreviewParams>>({
    async handle({ context, input }): Promise<Response> {
      const preview = await dependencies.getPreview.execute({ context: context.scope, ...input })
      return jsonResponse({ body: { data: preview }, status: 200 })
    },
    method: 'GET',
    parse: ({ pathParameters, request }) => ({
      items: parseCargoPreviewItemsQuery(new URL(request.url)),
      previewId: parseUuidPathIdentifier(pathParameters.id ?? ''),
    }),
    pathname: API_CARGO_PREVIEW_PATH,
    policy: CARGO_ARRIVAL_READ_POLICY,
  })
}
