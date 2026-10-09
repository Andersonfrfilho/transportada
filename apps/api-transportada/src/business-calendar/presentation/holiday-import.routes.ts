/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.1 (ADR-0100 §4, RF9): a gestão da importação de feriados da FeriadosAPI. É configuração da
 * empresa: `settings.manage` para ler e para escrever. Desligar e restaurar um feriado importado, mais o
 * status do que a rotina do worker já buscou — agregado só para as cidades da empresa do contexto.
 */
import type { ClientIpResolver } from '../../http/client-ip.service.js'
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import {
  API_HOLIDAY_IMPORT_CITIES_PATH,
  API_HOLIDAY_IMPORT_STATUS_PATH,
  API_HOLIDAY_IMPORT_SUPPRESSIONS_PATH,
} from '../../shared/api.constant.js'
import type { BusinessCalendarActor } from '../application/business-calendar-actor.types.js'
import type { HolidayImportUseCases } from '../application/holiday-import.use-case.js'
import { BUSINESS_CALENDAR_MANAGE_POLICY } from './business-calendar-policy.constant.js'
import { jsonData, jsonPage, noContent } from './business-calendar-response.support.js'
import {
  parseDisableBody,
  parseNoQuery,
  parsePageQuery,
  toCityViews,
  toStatusView,
  toSuppressionView,
  type DisableHolidayBody,
} from './holiday-import.schema.js'

const SUPPRESSION_PATH = `${API_HOLIDAY_IMPORT_SUPPRESSIONS_PATH}/:id`

type Dependencies = HolidayImportUseCases & { readonly resolveClientIp: ClientIpResolver }
type RequestMeta = Pick<BusinessCalendarActor, 'correlationId' | 'ipAddress'>

export function createHolidayImportRoutes(
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
      async handle({ context }) {
        const status = await dependencies.status.execute({ companyId: context.scope.companyId })
        return jsonData({ data: toStatusView(status) })
      },
      method: 'GET',
      parse: ({ request }) => parseNoQuery(request),
      pathname: API_HOLIDAY_IMPORT_STATUS_PATH,
      policy: BUSINESS_CALENDAR_MANAGE_POLICY,
    }),
    defineRoute<{ readonly page: number; readonly perPage: number }>({
      async handle({ context, input }) {
        const cities = await dependencies.cities.execute({
          companyId: context.scope.companyId,
          ...input,
        })
        return jsonPage({ data: toCityViews(cities), ...input, total: cities.total })
      },
      method: 'GET',
      parse: ({ request }) => parsePageQuery(request),
      pathname: API_HOLIDAY_IMPORT_CITIES_PATH,
      policy: BUSINESS_CALENDAR_MANAGE_POLICY,
    }),
    defineRoute<{ readonly page: number; readonly perPage: number }>({
      async handle({ context, input }) {
        const suppressions = await dependencies.suppressions.execute({
          companyId: context.scope.companyId,
          ...input,
        })
        return jsonPage({
          data: suppressions.items.map(toSuppressionView),
          ...input,
          total: suppressions.total,
        })
      },
      method: 'GET',
      parse: ({ request }) => parsePageQuery(request),
      pathname: API_HOLIDAY_IMPORT_SUPPRESSIONS_PATH,
      policy: BUSINESS_CALENDAR_MANAGE_POLICY,
    }),
    defineRoute<RequestMeta & DisableHolidayBody>({
      async handle({ context, input }) {
        const suppression = await dependencies.disable.execute({
          ...input,
          companyId: context.scope.companyId,
          userId: context.scope.userId,
        })
        return jsonData({ data: toSuppressionView(suppression), status: 201 })
      },
      method: 'POST',
      parse: async (params) => ({ ...meta(params), ...(await parseDisableBody(params.request)) }),
      pathname: API_HOLIDAY_IMPORT_SUPPRESSIONS_PATH,
      policy: BUSINESS_CALENDAR_MANAGE_POLICY,
    }),
    defineRoute<RequestMeta & { readonly id: string }>({
      async handle({ context, input }) {
        await dependencies.restore.execute({
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
      pathname: SUPPRESSION_PATH,
      policy: BUSINESS_CALENDAR_MANAGE_POLICY,
    }),
  ]
}
