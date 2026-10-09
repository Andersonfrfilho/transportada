/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.2 (ADR-0100 §6, CA13): a montagem da viagem pergunta quais dos dias das paradas fecham por feriado.
 * É leitura de frota (`fleet.read`, como o `GET /municipal-holidays`): um `POST` só porque o pedido leva até
 * 200 itens, e a empresa vem só do contexto.
 */
import { defineRoute } from '../../http/router.service.js'
import { API_BUSINESS_CALENDAR_DAY_CHECKS_PATH } from '../../shared/api.constant.js'
import type { DayChecksUseCase, DayCheckItem } from '../application/day-checks.use-case.js'
import { BUSINESS_CALENDAR_READ_POLICY } from './business-calendar-policy.constant.js'
import { jsonData } from './business-calendar-response.support.js'
import { parseDayChecksBody, toHolidayWarningView } from './day-checks.schema.js'

type Dependencies = { readonly dayChecks: DayChecksUseCase }

export function createDayChecksRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<{ readonly items: readonly DayCheckItem[] }>({
      async handle({ context, input }) {
        const warnings = await dependencies.dayChecks.execute({
          companyId: context.scope.companyId,
          items: input.items,
        })
        return jsonData({ data: warnings.map(toHolidayWarningView) })
      },
      method: 'POST',
      parse: ({ request }) => parseDayChecksBody(request),
      pathname: API_BUSINESS_CALENDAR_DAY_CHECKS_PATH,
      policy: BUSINESS_CALENDAR_READ_POLICY,
    }),
  ]
}
