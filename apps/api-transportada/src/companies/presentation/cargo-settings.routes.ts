/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O peso padrão por volume da empresa (spec 067). Ele mora em `settings.manage` porque calibra o
 * número que vai para a SEFAZ quando o emitente não declara massa — é configuração, não operação.
 */
import { defineRoute } from '../../http/router.service.js'
import { API_COMPANY_SETTINGS_CARGO_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { CargoSettings } from '../application/cargo-settings.port.js'
import { parseSetDefaultVolumeWeightBody } from './cargo-settings.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

type SetInput = { readonly defaultVolumeWeight: string }

type Dependencies = {
  readonly clear: { execute(input: { readonly companyId: string }): Promise<void> }
  readonly get: {
    execute(input: { readonly companyId: string }): Promise<CargoSettings>
  }
  readonly set: {
    execute(input: {
      readonly companyId: string
      readonly defaultVolumeWeight: string
    }): Promise<CargoSettings>
  }
}

export function createCargoSettingsRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const settings = await dependencies.get.execute({ companyId: context.scope.companyId })
        return jsonResponse(settings)
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_COMPANY_SETTINGS_CARGO_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<SetInput>({
      async handle({ context, input }): Promise<Response> {
        const settings = await dependencies.set.execute({
          companyId: context.scope.companyId,
          defaultVolumeWeight: input.defaultVolumeWeight,
        })
        return jsonResponse(settings)
      },
      method: 'PUT',
      parse: ({ request }) => parseSetDefaultVolumeWeightBody(request),
      pathname: API_COMPANY_SETTINGS_CARGO_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        await dependencies.clear.execute({ companyId: context.scope.companyId })
        return new Response(null, { headers: { 'cache-control': 'no-store' }, status: 204 })
      },
      method: 'DELETE',
      parse: () => undefined,
      pathname: API_COMPANY_SETTINGS_CARGO_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}

function jsonResponse(settings: CargoSettings): Response {
  return new Response(JSON.stringify({ data: settings }), {
    headers: NO_STORE_HEADERS,
    status: 200,
  })
}
