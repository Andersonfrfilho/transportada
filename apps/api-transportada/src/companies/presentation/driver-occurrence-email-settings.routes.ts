/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 322: o e-mail do aviso da ocorrência do motorista, por empresa. Sem linha é resposta válida (ligado), não
 * 404. A empresa e o ator vêm só do contexto autenticado.
 */
import type { ClientIpResolver } from '../../http/client-ip.service.js'
import { defineRoute } from '../../http/router.service.js'
import {
  API_COMPANY_SETTINGS_DRIVER_OCCURRENCE_EMAIL_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type {
  DriverOccurrenceEmailSettings,
  SaveDriverOccurrenceEmailSettingsParams,
} from '../application/driver-occurrence-email-settings.port.js'
import { parseDriverOccurrenceEmailSettingsBody } from './driver-occurrence-email-settings.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

type Dependencies = {
  readonly get: {
    execute(params: { readonly companyId: string }): Promise<DriverOccurrenceEmailSettings>
  }
  readonly resolveClientIp: ClientIpResolver
  readonly save: {
    execute(params: SaveDriverOccurrenceEmailSettingsParams): Promise<DriverOccurrenceEmailSettings>
  }
}

type SaveInput = {
  readonly correlationId: string
  readonly enabled: boolean
  readonly ipAddress: string
}

export function createDriverOccurrenceEmailSettingsRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        return settingsResponse(
          await dependencies.get.execute({ companyId: context.scope.companyId }),
        )
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_COMPANY_SETTINGS_DRIVER_OCCURRENCE_EMAIL_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<SaveInput>({
      async handle({ context, input }): Promise<Response> {
        return settingsResponse(
          await dependencies.save.execute({
            companyId: context.scope.companyId,
            correlationId: input.correlationId,
            enabled: input.enabled,
            ipAddress: input.ipAddress,
            userId: context.scope.userId,
          }),
        )
      },
      method: 'PUT',
      parse: async ({ correlationId, request }) => ({
        correlationId,
        ipAddress: dependencies.resolveClientIp(request),
        ...(await parseDriverOccurrenceEmailSettingsBody(request)),
      }),
      pathname: API_COMPANY_SETTINGS_DRIVER_OCCURRENCE_EMAIL_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}

/** Lista branca de campos: o objeto do repositório nunca é espalhado na resposta. */
function settingsResponse(settings: DriverOccurrenceEmailSettings): Response {
  const data = { enabled: settings.enabled, updatedAt: settings.updatedAt?.toISOString() ?? null }

  return new Response(JSON.stringify({ data }), { headers: NO_STORE_HEADERS, status: 200 })
}
