/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import {
  assertJsonContentType,
  parseJson,
  readBoundedRequestBody,
} from '../../shared/request-body.service.js'
import { JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import { parseUuidPathIdentifier } from '../../nfe-imports/presentation/nfe-imports.schema.js'
import type { ListPackageBoxes } from '../application/list-package-boxes.use-case.js'
import type { MeasurePackageBox } from '../application/measure-package-box.use-case.js'
import type { PackageBoxMeasurement } from '../application/package-box.port.js'
import { parsePackageBoxList, parsePackageBoxMeasurement } from './package-box.schema.js'
import type { PackageBoxListInput } from './package-box.schema.js'

export const API_NFE_PACKAGE_BOXES_PATH = '/nfe-package-boxes'

/**
 * ⚠️ `cargo.measure`, e não `settings.manage` (spec 085 G005). Quem confere caixa no galpão
 * receberia de carona o preço do combustível, a tabela de frete e a credencial da prefeitura.
 */
const CARGO_MEASURE_POLICY = { permission: 'cargo.measure', scope: 'company' } as const

type MeasureInput = {
  readonly boxId: string
  readonly measurement: PackageBoxMeasurement
}

export function createPackageBoxRoutes(dependencies: {
  readonly listPackageBoxes: ListPackageBoxes
  readonly measurePackageBox: MeasurePackageBox
}): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<PackageBoxListInput>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.listPackageBoxes.execute({
          context: context.scope,
          filters: input.filters,
          limit: input.limit,
        })
        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'GET',
      parse: ({ request }) => parsePackageBoxList(new URL(request.url)),
      pathname: API_NFE_PACKAGE_BOXES_PATH,
      policy: CARGO_MEASURE_POLICY,
    }),
    defineRoute<MeasureInput>({
      async handle({ context, input }): Promise<Response> {
        const measured = await dependencies.measurePackageBox.execute({
          boxId: input.boxId,
          context: context.scope,
          measurement: input.measurement,
        })
        /**
         * ⚠️ **200 com corpo vazio, e não o 204 que `apis.md` pede** — desvio medido, não descuido.
         * Com `204` o navegador recusa a resposta (`TypeError: Failed to fetch`) mesmo com a linha
         * já gravada: o conferente lê erro e remede a mesma caixa. Medido em 06/09/2026 num
         * experimento controlado — mesma rota, mesmo método, mesmo corpo, só o status mudando:
         * `200` passa, `204` falha, inclusive construído no molde das outras rotas de 204 daqui.
         *
         * A causa não foi isolada e **alcança toda rota de 204 desta API** chamada de outra origem;
         * está registrada em `specs/OBJETIVO-PENDENTES.md` para ser investigada fora desta spec.
         * O corpo continua vazio de propósito: a linha gravada não tem os campos da fila, e
         * devolvê-la faria o cliente validar dois formatos com um guard só.
         */
        return jsonResponse({ body: {}, status: measured ? 200 : 404 })
      },
      method: 'PUT',
      parse: async ({ pathParameters, request }): Promise<MeasureInput> => ({
        boxId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        measurement: parsePackageBoxMeasurement(await readMeasurementBody(request)),
      }),
      pathname: `${API_NFE_PACKAGE_BOXES_PATH}/:id`,
      policy: CARGO_MEASURE_POLICY,
    }),
  ]
}

async function readMeasurementBody(request: Request): Promise<unknown> {
  assertJsonContentType(request.headers.get('content-type'))
  return parseJson(await readBoundedRequestBody(request))
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}
