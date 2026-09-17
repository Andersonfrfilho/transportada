/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * `POST`/`GET /v1/toll-booths/extracts` (spec 154 RF3/RF3b) — separado de `toll-booth.routes.ts`
 * (RF1, `fleet.read`) porque a permissão e o efeito colateral (bucket + tabela) são outros; code-
 * standart §9 pede um arquivo por conceito de qualquer forma.
 */
import { defineRoute } from '../../http/router.service.js'
import { API_TOLL_BOOTH_EXTRACTS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type {
  TollBoothExtractRow,
  TollBoothExtractRowInput,
} from '../domain/toll-booth-extract.policy.js'
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
