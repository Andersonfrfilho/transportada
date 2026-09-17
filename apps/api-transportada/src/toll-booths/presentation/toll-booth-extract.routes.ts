/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * `POST`/`GET /v1/toll-booths/extracts` (spec 154 RF3/RF3b) — separado de `toll-booth.routes.ts`
 * (RF1, `fleet.read`) porque a permissão e o efeito colateral (bucket + tabela) são outros; code-
 * standart §9 pede um arquivo por conceito de qualquer forma.
 */
import { defineRoute } from '../../http/router.service.js'
import {
  API_TOLL_BOOTH_EXTRACTS_PATH,
  API_TOLL_BOOTH_RELOAD_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type {
  ReloadTollBoothCatalogInput,
  ReloadTollBoothCatalogResult,
} from '../application/reload-toll-booth-catalog.use-case.js'
import type {
  TollBoothExtractRow,
  TollBoothExtractRowInput,
} from '../domain/toll-booth-extract.policy.js'
import {
  TOLL_BOOTH_CATALOG_RELOAD_RATE_LIMIT,
  TOLL_BOOTH_EXTRACT_UPLOAD_RATE_LIMIT,
} from './toll-booth-extract.rate-limit.js'
import {
  parseTollBoothExtractBody,
  parseTollBoothExtractQuery,
  type TollBoothExtractQuery,
} from './toll-booth-extract.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

type CreateInput = TollBoothExtractQuery & {
  readonly booths: readonly TollBoothExtractRowInput[]
  readonly rawBody: Uint8Array
}

type Dependencies = {
  readonly createExtract: {
    execute(
      input: TollBoothExtractQuery & {
        readonly actorUserId: string
        readonly booths: readonly TollBoothExtractRowInput[]
        readonly rawBody: Uint8Array
      },
    ): Promise<TollBoothExtractRow>
  }
  readonly listExtracts: { execute(): Promise<readonly TollBoothExtractRow[]> }
}

export function createTollBoothExtractRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<CreateInput>({
      async handle({ context, input }): Promise<Response> {
        const extract = await dependencies.createExtract.execute({
          actorUserId: context.scope.userId,
          booths: input.booths,
          dataset: input.dataset,
          observedOn: input.observedOn,
          rawBody: input.rawBody,
        })
        return jsonResponse({ body: { data: serializeExtract(extract) }, status: 201 })
      },
      method: 'POST',
      async parse({ request }) {
        const query = parseTollBoothExtractQuery(new URL(request.url))
        const body = await parseTollBoothExtractBody(request)
        return { ...query, ...body }
      },
      pathname: API_TOLL_BOOTH_EXTRACTS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
      rateLimit: TOLL_BOOTH_EXTRACT_UPLOAD_RATE_LIMIT,
    }),
    defineRoute<undefined>({
      async handle(): Promise<Response> {
        const extracts = await dependencies.listExtracts.execute()
        return jsonResponse({ body: { data: extracts.map(serializeExtract) } })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_TOLL_BOOTH_EXTRACTS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}

type ReloadInput = TollBoothExtractQuery & { readonly correlationId: string }

/**
 * `POST /v1/toll-booths/reload` (spec 154 RF4) — `?dataset=&observedOn=`, corpo ignorado. Ator,
 * empresa e correlação vêm do contexto autenticado, nunca da requisição.
 */
export function createTollBoothCatalogReloadRoutes(dependencies: {
  readonly reloadCatalog: {
    execute(input: ReloadTollBoothCatalogInput): Promise<ReloadTollBoothCatalogResult>
  }
}): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<ReloadInput>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.reloadCatalog.execute({
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          dataset: input.dataset,
          observedOn: input.observedOn,
        })
        return jsonResponse({
          body: { data: { ...result, reloadedAt: result.reloadedAt.toISOString() } },
        })
      },
      method: 'POST',
      parse: ({ correlationId, request }) => ({
        ...parseTollBoothExtractQuery(new URL(request.url)),
        correlationId,
      }),
      pathname: API_TOLL_BOOTH_RELOAD_PATH,
      policy: SETTINGS_MANAGE_POLICY,
      rateLimit: TOLL_BOOTH_CATALOG_RELOAD_RATE_LIMIT,
    }),
  ]
}

function serializeExtract(extract: TollBoothExtractRow): Record<string, unknown> {
  return {
    boothCount: extract.boothCount,
    boothsWithAxleCharge: extract.boothsWithAxleCharge,
    boothsWithCharge: extract.boothsWithCharge,
    dataset: extract.dataset,
    missingObjectObservedAt: extract.missingObjectObservedAt?.toISOString() ?? null,
    objectKey: extract.objectKey,
    observedOn: extract.observedOn,
    reloadedAt: extract.reloadedAt?.toISOString() ?? null,
    reloadedBoothCount: extract.reloadedBoothCount,
    reloadedByUserId: extract.reloadedByUserId,
    sha256: extract.sha256,
    uploadedByUserId: extract.uploadedByUserId,
  }
}

function jsonResponse(input: { readonly body: unknown; readonly status?: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: NO_STORE_HEADERS,
    status: input.status ?? 200,
  })
}
