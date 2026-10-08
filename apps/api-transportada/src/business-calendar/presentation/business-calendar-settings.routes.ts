/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3 (RF5): se o sábado conta como dia útil. Sem linha é resposta válida (`false`, origem
 * `default`), não 404; `settings.manage` para ler e escrever.
 */
import { z } from 'zod'

import type { ClientIpResolver } from '../../http/client-ip.service.js'
import { defineRoute } from '../../http/router.service.js'
import { parseBody } from '../../http/request-parsing.service.js'
import { API_COMPANY_SETTINGS_BUSINESS_CALENDAR_PATH } from '../../shared/api.constant.js'
import type { BusinessCalendarActor } from '../application/business-calendar-actor.types.js'
import type { BusinessCalendarSettingsRecord } from '../application/business-calendar-settings.port.js'
import type { BusinessCalendarSettingsUseCases } from '../application/business-calendar-settings.use-case.js'
import { BUSINESS_CALENDAR_MANAGE_POLICY } from './business-calendar-policy.constant.js'
import { jsonData } from './business-calendar-response.support.js'

const SETTINGS_ORIGIN = { company: 'company', default: 'default' } as const

/** `.strict()`: a empresa vem do contexto, e `companyId` ou o autor no corpo são recusados. */
const settingsSchema = z.object({ saturdayIsBusinessDay: z.boolean() }).strict()

type Dependencies = BusinessCalendarSettingsUseCases & {
  readonly resolveClientIp: ClientIpResolver
}
type SaveInput = Pick<BusinessCalendarActor, 'correlationId' | 'ipAddress'> & {
  readonly saturdayIsBusinessDay: boolean
}

export function createBusinessCalendarSettingsRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }) {
        const stored = await dependencies.get.execute({ companyId: context.scope.companyId })
        return settingsResponse(stored)
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_COMPANY_SETTINGS_BUSINESS_CALENDAR_PATH,
      policy: BUSINESS_CALENDAR_MANAGE_POLICY,
    }),
    defineRoute<SaveInput>({
      async handle({ context, input }) {
        const saved = await dependencies.save.execute({
          ...input,
          companyId: context.scope.companyId,
          userId: context.scope.userId,
        })
        return settingsResponse(saved)
      },
      method: 'PUT',
      parse: async ({ correlationId, request }) => ({
        correlationId,
        ipAddress: dependencies.resolveClientIp(request),
        ...(await parseBody(settingsSchema, request)),
      }),
      pathname: API_COMPANY_SETTINGS_BUSINESS_CALENDAR_PATH,
      policy: BUSINESS_CALENDAR_MANAGE_POLICY,
    }),
  ]
}

/** Lista branca de campos: o objeto do repositório nunca é espalhado na resposta. */
function settingsResponse(settings: BusinessCalendarSettingsRecord | null): Response {
  return jsonData({
    data:
      settings === null
        ? { origin: SETTINGS_ORIGIN.default, saturdayIsBusinessDay: false, updatedAt: null }
        : {
            origin: SETTINGS_ORIGIN.company,
            saturdayIsBusinessDay: settings.saturdayIsBusinessDay,
            updatedAt: settings.updatedAt.toISOString(),
          },
  })
}
