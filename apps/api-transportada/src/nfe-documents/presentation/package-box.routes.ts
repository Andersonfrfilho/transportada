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
import type { CameraMeasurementSettingsPort } from '../application/camera-measurement-settings.port.js'
import type { ListPackageBoxes } from '../application/list-package-boxes.use-case.js'
import type { ListPackageBoxSiblings } from '../application/list-package-box-siblings.use-case.js'
import type { MeasurePackageBox } from '../application/measure-package-box.use-case.js'
import type { PackageBoxMeasurement } from '../application/package-box.port.js'
import type { ReplicatePackageBoxMeasurement } from '../application/replicate-package-box-measurement.use-case.js'
import {
  parsePackageBoxList,
  parsePackageBoxMeasurement,
  parsePackageBoxReplication,
} from './package-box.schema.js'
import type { PackageBoxListInput } from './package-box.schema.js'

export const API_NFE_PACKAGE_BOXES_PATH = '/nfe-package-boxes'
export const API_NFE_PACKAGE_BOX_MEASUREMENT_SETTINGS_PATH =
  '/nfe-package-boxes/measurement-settings'

/**
 * ⚠️ `cargo.measure`, e não `settings.manage` (spec 085 G005). Quem confere caixa no galpão
 * receberia de carona o preço do combustível, a tabela de frete e a credencial da prefeitura.
 */
const CARGO_MEASURE_POLICY = { permission: 'cargo.measure', scope: 'company' } as const

type MeasureInput = {
  readonly boxId: string
  readonly measurement: PackageBoxMeasurement
}

type SiblingsInput = {
  readonly boxId: string
}

type ReplicateInput = {
  readonly boxId: string
  readonly targetIds: readonly string[]
}

export function createPackageBoxRoutes(dependencies: {
  readonly cameraMeasurementSettings: CameraMeasurementSettingsPort
  readonly listPackageBoxes: ListPackageBoxes
  readonly listPackageBoxSiblings: ListPackageBoxSiblings
  readonly measurePackageBox: MeasurePackageBox
  readonly replicatePackageBoxMeasurement: ReplicatePackageBoxMeasurement
}): readonly ReturnType<typeof defineRoute>[] {
  return [
    /**
     * Spec 152 D14: leitura própria do conferente (`cargo.measure`, não `settings.manage`) — é o que
     * decide, na abertura da etapa Medida, se ela existe. Ausência de linha é `false` (mesma porta do
     * use case de medida).
     */
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const enabled = await dependencies.cameraMeasurementSettings.readEnabled({
          companyId: context.scope.companyId,
        })
        return jsonResponse({ body: { data: { cameraMeasurementEnabled: enabled } }, status: 200 })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_NFE_PACKAGE_BOX_MEASUREMENT_SETTINGS_PATH,
      policy: CARGO_MEASURE_POLICY,
    }),
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
    /** Spec 155 (G003): as irmãs de família (replicáveis) e de embalagem (só mostradas, D3). */
    defineRoute<SiblingsInput>({
      async handle({ context, input }): Promise<Response> {
        const siblings = await dependencies.listPackageBoxSiblings.execute({
          boxId: input.boxId,
          context: context.scope,
        })
        return jsonResponse({ body: { data: siblings }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        boxId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: `${API_NFE_PACKAGE_BOXES_PATH}/:id/siblings`,
      policy: CARGO_MEASURE_POLICY,
    }),
    /** Spec 155 (G004, G005, G006): copia a medida da origem para os alvos da mesma família. */
    defineRoute<ReplicateInput>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.replicatePackageBoxMeasurement.execute({
          boxId: input.boxId,
          context: context.scope,
          targetIds: input.targetIds,
        })
        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'POST',
      parse: async ({ pathParameters, request }) => ({
        boxId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        targetIds: parsePackageBoxReplication(await readMeasurementBody(request)).targetIds,
      }),
      pathname: `${API_NFE_PACKAGE_BOXES_PATH}/:id/replicate`,
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
