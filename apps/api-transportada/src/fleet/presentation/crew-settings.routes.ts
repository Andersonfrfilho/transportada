/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A diária padrão do ajudante (spec 149). GET é `fleet.read` — quem monta a viagem precisa ver o
 * valor que vai entrar na conta; PUT é `fleet.manage`, porque parametrizar é administrar a frota.
 */
import { defineRoute } from '../../http/router.service.js'
import { API_COMPANY_CREW_SETTINGS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { CrewSettings } from '../application/crew-settings.port.js'
import { parseSetCrewSettingsBody } from './crew-settings.schema.js'

const FLEET_MANAGE_POLICY = { permission: 'fleet.manage', scope: 'company' } as const
const FLEET_READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

type SetInput = { readonly helperDailyRate: string | null }

type Dependencies = {
  readonly get: { execute(input: { readonly companyId: string }): Promise<CrewSettings> }
  readonly set: {
    execute(input: {
      readonly companyId: string
      readonly helperDailyRate: string | null
    }): Promise<CrewSettings>
  }
}

export function createCompanyCrewSettingsRoutes(
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
      pathname: API_COMPANY_CREW_SETTINGS_PATH,
      policy: FLEET_READ_POLICY,
    }),
    defineRoute<SetInput>({
      async handle({ context, input }): Promise<Response> {
        const settings = await dependencies.set.execute({
          companyId: context.scope.companyId,
          helperDailyRate: input.helperDailyRate,
        })
        return jsonResponse(settings)
      },
      method: 'PUT',
      parse: ({ request }) => parseSetCrewSettingsBody(request),
      pathname: API_COMPANY_CREW_SETTINGS_PATH,
      policy: FLEET_MANAGE_POLICY,
    }),
  ]
}

function jsonResponse(settings: CrewSettings): Response {
  return new Response(JSON.stringify({ data: settings }), {
    headers: NO_STORE_HEADERS,
    status: 200,
  })
}
