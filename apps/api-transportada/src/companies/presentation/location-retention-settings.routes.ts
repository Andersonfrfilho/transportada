/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 239 RF1-RF4: o expurgo da posição dos eventos da viagem, por empresa. `settings.manage`
 * porque apagar dado pessoal é decisão de configuração. Sem linha é resposta válida (desligado,
 * 90 dias), não 404. Nenhuma resposta carrega coordenada, id de evento, usuário ou data de evento.
 */
import { defineRoute } from '../../http/router.service.js'
import type { ClientIpResolver } from '../../http/client-ip.service.js'
import {
  API_COMPANY_SETTINGS_LOCATION_RETENTION_IMPACT_PATH,
  API_COMPANY_SETTINGS_LOCATION_RETENTION_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import {
  DEFAULT_LOCATION_RETENTION,
  LOCATION_RETENTION_ORIGIN,
  type LocationRetentionOrigin,
} from '../domain/location-retention.constant.js'
import type {
  LocationRetentionActor,
  LocationRetentionImpactEntry,
  LocationRetentionSettings,
} from '../application/location-retention-settings.port.js'
import {
  parseLocationRetentionImpactQuery,
  parseLocationRetentionSettingsBody,
} from './location-retention-settings.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

type Dependencies = {
  readonly clear: { execute(input: LocationRetentionActor): Promise<void> }
  readonly get: {
    execute(input: { readonly companyId: string }): Promise<LocationRetentionSettings | null>
  }
  readonly impact: {
    execute(input: {
      readonly companyId: string
      readonly retentionDays: number
    }): Promise<readonly LocationRetentionImpactEntry[]>
  }
  readonly resolveClientIp: ClientIpResolver
  readonly save: {
    execute(
      input: LocationRetentionActor & {
        readonly purgeEnabled: boolean
        readonly retentionDays: number
      },
    ): Promise<LocationRetentionSettings>
  }
}

type RequestMeta = { readonly correlationId: string; readonly ipAddress: string }
type SaveInput = RequestMeta & { readonly purgeEnabled: boolean; readonly retentionDays: number }
type ImpactInput = { readonly retentionDays: number }

type LocationRetentionSettingsView = {
  readonly origin: LocationRetentionOrigin
  readonly purgeEffectiveAt: string | null
  readonly purgeEnabled: boolean
  readonly retentionDays: number
  readonly updatedAt: string | null
}

export function createLocationRetentionSettingsRoutes(
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
      pathname: API_COMPANY_SETTINGS_LOCATION_RETENTION_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<SaveInput>({
      async handle({ context, input }): Promise<Response> {
        return settingsResponse(
          await dependencies.save.execute({
            companyId: context.scope.companyId,
            correlationId: input.correlationId,
            ipAddress: input.ipAddress,
            purgeEnabled: input.purgeEnabled,
            retentionDays: input.retentionDays,
            userId: context.scope.userId,
          }),
        )
      },
      method: 'PUT',
      parse: async ({ correlationId, request }) => ({
        correlationId,
        ipAddress: dependencies.resolveClientIp(request),
        ...(await parseLocationRetentionSettingsBody(request)),
      }),
      pathname: API_COMPANY_SETTINGS_LOCATION_RETENTION_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<RequestMeta>({
      async handle({ context, input }): Promise<Response> {
        await dependencies.clear.execute({
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          ipAddress: input.ipAddress,
          userId: context.scope.userId,
        })
        return new Response(null, { headers: { 'cache-control': 'no-store' }, status: 204 })
      },
      method: 'DELETE',
      parse: ({ correlationId, request }) => ({
        correlationId,
        ipAddress: dependencies.resolveClientIp(request),
      }),
      pathname: API_COMPANY_SETTINGS_LOCATION_RETENTION_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<ImpactInput>({
      async handle({ context, input }): Promise<Response> {
        const entries = await dependencies.impact.execute({
          companyId: context.scope.companyId,
          retentionDays: input.retentionDays,
        })
        return jsonResponse({
          byTable: entries.map((entry) => ({
            capped: entry.capped,
            count: entry.count,
            kind: entry.kind,
          })),
        })
      },
      method: 'GET',
      parse: ({ request }) => parseLocationRetentionImpactQuery(request),
      pathname: API_COMPANY_SETTINGS_LOCATION_RETENTION_IMPACT_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify({ data }), { headers: NO_STORE_HEADERS, status: 200 })
}

/** Lista branca de campos: o objeto do repositório nunca é espalhado na resposta. */
function settingsResponse(settings: LocationRetentionSettings | null): Response {
  const data: LocationRetentionSettingsView =
    settings === null
      ? {
          origin: LOCATION_RETENTION_ORIGIN.default,
          purgeEffectiveAt: null,
          purgeEnabled: DEFAULT_LOCATION_RETENTION.purgeEnabled,
          retentionDays: DEFAULT_LOCATION_RETENTION.retentionDays,
          updatedAt: null,
        }
      : {
          origin: LOCATION_RETENTION_ORIGIN.company,
          purgeEffectiveAt: settings.purgeEffectiveAt?.toISOString() ?? null,
          purgeEnabled: settings.purgeEnabled,
          retentionDays: settings.retentionDays,
          updatedAt: settings.updatedAt.toISOString(),
        }

  return jsonResponse(data)
}
