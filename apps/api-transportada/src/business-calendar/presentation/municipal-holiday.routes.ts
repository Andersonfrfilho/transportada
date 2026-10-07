/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O feriado do município é cadastro de configuração da operação: ler é `fleet.read` (o roteiro e a
 * viagem consultam), escrever é `settings.manage`. Spec 238 T1.3: a data digitada convive com a gerada
 * pela regra "todo ano" nesta mesma tabela, e a resposta diz o tipo e de qual regra a data veio.
 */
import type { ClientIpResolver } from '../../http/client-ip.service.js'
import { defineRoute } from '../../http/router.service.js'
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { API_MUNICIPAL_HOLIDAYS_PATH } from '../../shared/api.constant.js'
import type { BusinessCalendarActor } from '../application/business-calendar-actor.types.js'
import type { MunicipalHolidayChanges } from '../application/municipal-holiday.port.js'
import type { MunicipalHolidaysUseCases } from '../application/municipal-holidays.use-case.js'
import {
  BUSINESS_CALENDAR_MANAGE_POLICY,
  BUSINESS_CALENDAR_READ_POLICY,
} from './business-calendar-policy.constant.js'
import { jsonData, noContent } from './business-calendar-response.support.js'
import {
  parseHolidayFilters,
  parseSaveHolidayBody,
  parseUpdateHolidayBody,
  toHolidayView,
  toSavedHolidayView,
  type MunicipalHolidayFilters,
} from './municipal-holiday.schema.js'

const HOLIDAY_PATH = `${API_MUNICIPAL_HOLIDAYS_PATH}/:id`

type Dependencies = MunicipalHolidaysUseCases & { readonly resolveClientIp: ClientIpResolver }
type RequestMeta = Pick<BusinessCalendarActor, 'correlationId' | 'ipAddress'>
type SaveInput = RequestMeta & Awaited<ReturnType<typeof parseSaveHolidayBody>>

export function createMunicipalHolidayRoutes(
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
    defineRoute<MunicipalHolidayFilters>({
      async handle({ context, input }) {
        const holidays = await dependencies.list.execute({
          companyId: context.scope.companyId,
          ...input,
        })
        return jsonData({ data: holidays.map(toHolidayView) })
      },
      method: 'GET',
      parse: ({ request }) => parseHolidayFilters(request),
      pathname: API_MUNICIPAL_HOLIDAYS_PATH,
      policy: BUSINESS_CALENDAR_READ_POLICY,
    }),
    defineRoute<SaveInput>({
      async handle({ context, input }) {
        const saved = await dependencies.save.execute({
          ...input,
          companyId: context.scope.companyId,
          userId: context.scope.userId,
        })
        return jsonData({ data: toSavedHolidayView(saved), status: 201 })
      },
      method: 'POST',
      parse: async (params) => ({
        ...meta(params),
        ...(await parseSaveHolidayBody(params.request)),
      }),
      pathname: API_MUNICIPAL_HOLIDAYS_PATH,
      policy: BUSINESS_CALENDAR_MANAGE_POLICY,
    }),
    defineRoute<RequestMeta & { readonly changes: MunicipalHolidayChanges; readonly id: string }>({
      async handle({ context, input }) {
        const holiday = await dependencies.update.execute({
          ...input,
          companyId: context.scope.companyId,
          userId: context.scope.userId,
        })
        return jsonData({ data: toHolidayView(holiday) })
      },
      method: 'PATCH',
      parse: async (params) => ({
        ...meta(params),
        changes: await parseUpdateHolidayBody(params.request),
        id: parseUuidPathIdentifier(params.pathParameters.id ?? ''),
      }),
      pathname: HOLIDAY_PATH,
      policy: BUSINESS_CALENDAR_MANAGE_POLICY,
    }),
    defineRoute<RequestMeta & { readonly id: string }>({
      async handle({ context, input }) {
        await dependencies.remove.execute({
          ...input,
          companyId: context.scope.companyId,
          userId: context.scope.userId,
        })
        return noContent()
      },
      method: 'DELETE',
      parse: (params) => ({
        ...meta(params),
        id: parseUuidPathIdentifier(params.pathParameters.id ?? ''),
      }),
      pathname: HOLIDAY_PATH,
      policy: BUSINESS_CALENDAR_MANAGE_POLICY,
    }),
  ]
}
