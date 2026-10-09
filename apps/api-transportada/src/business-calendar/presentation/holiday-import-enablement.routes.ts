/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 (RF6): o liga/desliga da importação de feriados da empresa. Sem linha é resposta válida (ligada, origem
 * `default`), não 404; `settings.manage` para ler e escrever. Desligar não apaga nenhum feriado já importado.
 */
import { z } from 'zod'

import type { ClientIpResolver } from '../../http/client-ip.service.js'
import { parseBody } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { API_COMPANY_SETTINGS_HOLIDAY_IMPORT_PATH } from '../../shared/api.constant.js'
import type { BusinessCalendarActor } from '../application/business-calendar-actor.types.js'
import type {
  HolidayImportEnablementRecord,
  HolidayImportEnablementUseCases,
} from '../application/holiday-import-enablement.use-case.js'
import { BUSINESS_CALENDAR_MANAGE_POLICY } from './business-calendar-policy.constant.js'
import { jsonData } from './business-calendar-response.support.js'

const ENABLEMENT_ORIGIN = { company: 'company', default: 'default' } as const

/** `.strict()`: a empresa vem do contexto, e `companyId` ou qualquer campo do cursor no corpo são recusados. */
const enablementSchema = z.object({ isEnabled: z.boolean() }).strict()

type Dependencies = HolidayImportEnablementUseCases & { readonly resolveClientIp: ClientIpResolver }
type SaveInput = Pick<BusinessCalendarActor, 'correlationId' | 'ipAddress'> & {
  readonly isEnabled: boolean
}

export function createHolidayImportEnablementRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }) {
        const stored = await dependencies.get.execute({ companyId: context.scope.companyId })
        return enablementResponse(stored)
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_COMPANY_SETTINGS_HOLIDAY_IMPORT_PATH,
      policy: BUSINESS_CALENDAR_MANAGE_POLICY,
    }),
    defineRoute<SaveInput>({
      async handle({ context, input }) {
        const saved = await dependencies.save.execute({
          ...input,
          companyId: context.scope.companyId,
          userId: context.scope.userId,
        })
        return enablementResponse(saved)
      },
      method: 'PUT',
      parse: async ({ correlationId, request }) => ({
        correlationId,
        ipAddress: dependencies.resolveClientIp(request),
        ...(await parseBody(enablementSchema, request)),
      }),
      pathname: API_COMPANY_SETTINGS_HOLIDAY_IMPORT_PATH,
      policy: BUSINESS_CALENDAR_MANAGE_POLICY,
    }),
  ]
}

/** Lista branca de campos: o objeto do repositório nunca é espalhado na resposta. */
function enablementResponse(stored: HolidayImportEnablementRecord | null): Response {
  return jsonData({
    data:
      stored === null
        ? { isEnabled: true, origin: ENABLEMENT_ORIGIN.default }
        : { isEnabled: stored.isEnabled, origin: ENABLEMENT_ORIGIN.company },
  })
}
