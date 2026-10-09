/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 (ADR-0102 D2, RF3–RF5): a chave da FeriadosAPI e o orçamento mensal da INSTALAÇÃO. Ler é
 * `settings.manage`; trocar e remover a chave é `holiday-import.configure` (só o `company-admin`), com o balde de
 * escrita no Postgres. Nenhuma resposta leva a chave, o envelope ou quem alterou.
 */
import type { ClientIpResolver } from '../../http/client-ip.service.js'
import { defineRoute } from '../../http/router.service.js'
import {
  API_HOLIDAY_PROVIDER_SETTINGS_PATH,
  API_HOLIDAY_PROVIDER_SETTINGS_TOKEN_PATH,
  HOLIDAY_PROVIDER_SETTINGS_RATE_LIMIT,
} from '../../shared/api.constant.js'
import type { BusinessCalendarActor } from '../application/business-calendar-actor.types.js'
import type { HolidayProviderSettingsUseCases } from '../application/holiday-provider-settings.use-case.js'
import {
  BUSINESS_CALENDAR_MANAGE_POLICY,
  HOLIDAY_IMPORT_CONFIGURE_POLICY,
} from './business-calendar-policy.constant.js'
import { jsonData, noContent } from './business-calendar-response.support.js'
import {
  parseSaveHolidayProviderSettingsRequest,
  toHolidayProviderSettingsView,
  type SaveHolidayProviderSettingsBody,
} from './holiday-provider-settings.schema.js'

const WRITE_RATE_LIMIT = { ...HOLIDAY_PROVIDER_SETTINGS_RATE_LIMIT, store: 'postgres' } as const

type Dependencies = HolidayProviderSettingsUseCases & { readonly resolveClientIp: ClientIpResolver }
type RequestMeta = Pick<BusinessCalendarActor, 'correlationId' | 'ipAddress'>

export function createHolidayProviderSettingsRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  const meta = (params: {
    readonly correlationId: string
    readonly request: Request
  }): RequestMeta => ({
    correlationId: params.correlationId,
    ipAddress: dependencies.resolveClientIp(params.request),
  })

  return [
    defineRoute<undefined>({
      async handle() {
        return jsonData({ data: toHolidayProviderSettingsView(await dependencies.get.execute()) })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_HOLIDAY_PROVIDER_SETTINGS_PATH,
      policy: BUSINESS_CALENDAR_MANAGE_POLICY,
    }),
    defineRoute<RequestMeta & SaveHolidayProviderSettingsBody>({
      async handle({ context, input }) {
        const saved = await dependencies.save.execute({
          ...input,
          companyId: context.scope.companyId,
          userId: context.scope.userId,
        })
        return jsonData({ data: toHolidayProviderSettingsView(saved) })
      },
      method: 'PUT',
      parse: async (params) => ({
        ...meta(params),
        ...(await parseSaveHolidayProviderSettingsRequest(params.request)),
      }),
      pathname: API_HOLIDAY_PROVIDER_SETTINGS_PATH,
      policy: HOLIDAY_IMPORT_CONFIGURE_POLICY,
      rateLimit: WRITE_RATE_LIMIT,
    }),
    defineRoute<RequestMeta>({
      async handle({ context, input }) {
        await dependencies.removeToken.execute({
          ...input,
          companyId: context.scope.companyId,
          userId: context.scope.userId,
        })
        return noContent()
      },
      method: 'DELETE',
      parse: (params) => meta(params),
      pathname: API_HOLIDAY_PROVIDER_SETTINGS_TOKEN_PATH,
      policy: HOLIDAY_IMPORT_CONFIGURE_POLICY,
      rateLimit: WRITE_RATE_LIMIT,
    }),
  ]
}
