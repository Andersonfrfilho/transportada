/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O fator de cubagem por espécie (spec 075). Mora em `settings.manage` pelo mesmo motivo do peso
 * padrão: calibra um número estimado que a operação lê como se fosse medida, e por isso é
 * configuração — não operação.
 */
import { defineRoute } from '../../http/router.service.js'
import {
  API_COMPANY_SETTINGS_CARGO_VOLUME_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type { CargoVolumeFactor } from '../application/cargo-volume-factor.port.js'
import { parseSaveCargoVolumeFactorBody } from './cargo-volume-factor.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

type SaveInput = { readonly species: string; readonly volumePerUnitM3: string }

type Dependencies = {
  readonly list: {
    execute(input: { readonly companyId: string }): Promise<readonly CargoVolumeFactor[]>
  }
  readonly remove: {
    execute(input: { readonly companyId: string; readonly species?: string }): Promise<void>
  }
  readonly save: {
    execute(input: {
      readonly companyId: string
      readonly species: string
      readonly volumePerUnitM3: string
    }): Promise<readonly CargoVolumeFactor[]>
  }
}

export function createCargoVolumeFactorRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        return jsonResponse(await dependencies.list.execute({ companyId: context.scope.companyId }))
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_COMPANY_SETTINGS_CARGO_VOLUME_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<SaveInput>({
      async handle({ context, input }): Promise<Response> {
        return jsonResponse(
          await dependencies.save.execute({
            companyId: context.scope.companyId,
            species: input.species,
            volumePerUnitM3: input.volumePerUnitM3,
          }),
        )
      },
      method: 'PUT',
      parse: ({ request }) => parseSaveCargoVolumeFactorBody(request),
      pathname: API_COMPANY_SETTINGS_CARGO_VOLUME_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        await dependencies.remove.execute({ companyId: context.scope.companyId })
        return new Response(null, { headers: { 'cache-control': 'no-store' }, status: 204 })
      },
      method: 'DELETE',
      parse: () => undefined,
      pathname: API_COMPANY_SETTINGS_CARGO_VOLUME_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}

function jsonResponse(factors: readonly CargoVolumeFactor[]): Response {
  return new Response(JSON.stringify({ data: factors }), {
    headers: NO_STORE_HEADERS,
    status: 200,
  })
}
