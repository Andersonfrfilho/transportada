/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3 (RF4, RF8): o feriado estadual, em data fixa ou todo ano. `settings.manage` para ler
 * e escrever; a empresa e o ator vêm do contexto, o IP do resolvedor injetado.
 */
import type { ClientIpResolver } from '../../http/client-ip.service.js'
import { defineRoute } from '../../http/router.service.js'
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { API_STATE_HOLIDAYS_PATH } from '../../shared/api.constant.js'
import type { BusinessCalendarActor } from '../application/business-calendar-actor.types.js'
import type { StateHolidayChanges, StateHolidayInput } from '../application/state-holiday.port.js'
import type { StateHolidaysUseCases } from '../application/state-holidays.use-case.js'
import { jsonData, noContent } from './business-calendar-response.support.js'
import {
  parseCreateStateHolidayBody,
  parseStateHolidayListQuery,
  parseUpdateStateHolidayBody,
  toStateHolidayView,
} from './state-holiday.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const ITEM_PATH = `${API_STATE_HOLIDAYS_PATH}/:id`

type Dependencies = StateHolidaysUseCases & { readonly resolveClientIp: ClientIpResolver }
type RequestMeta = Pick<BusinessCalendarActor, 'correlationId' | 'ipAddress'>

export function createStateHolidayRoutes(
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
    defineRoute<{ readonly stateIbgeCode?: string }>({
      async handle({ context, input }) {
        const holidays = await dependencies.list.execute({
          companyId: context.scope.companyId,
          ...input,
        })
        return jsonData({ data: holidays.map(toStateHolidayView) })
      },
      method: 'GET',
      parse: ({ request }) => parseStateHolidayListQuery(request),
      pathname: API_STATE_HOLIDAYS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<RequestMeta & StateHolidayInput>({
      async handle({ context, input }) {
        const holiday = await dependencies.create.execute({
          ...input,
          companyId: context.scope.companyId,
          userId: context.scope.userId,
        })
        return jsonData({ data: toStateHolidayView(holiday), status: 201 })
      },
      method: 'POST',
      parse: async (params) => ({
        ...meta(params),
        ...(await parseCreateStateHolidayBody(params.request)),
      }),
      pathname: API_STATE_HOLIDAYS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<RequestMeta & { readonly changes: StateHolidayChanges; readonly id: string }>({
      async handle({ context, input }) {
        const holiday = await dependencies.update.execute({
          ...input,
          companyId: context.scope.companyId,
          userId: context.scope.userId,
        })
        return jsonData({ data: toStateHolidayView(holiday) })
      },
      method: 'PATCH',
      parse: async (params) => ({
        ...meta(params),
        changes: await parseUpdateStateHolidayBody(params.request),
        id: parseUuidPathIdentifier(params.pathParameters.id ?? ''),
      }),
      pathname: ITEM_PATH,
      policy: SETTINGS_MANAGE_POLICY,
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
      pathname: ITEM_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}
