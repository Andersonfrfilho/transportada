/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.1: os casos de uso da gestão da importação. O relógio é injetado e a conta de datas é a de
 * São Paulo: "hoje" decide o que ainda se desliga (D7), e o horizonte do status é o ano corrente e o
 * seguinte (D8).
 */
import { HOLIDAY_IMPORT_HORIZON_EXTRA_YEARS } from '../../shared/holiday-provider.constant.js'
import type { BusinessCalendarCoverage } from '../domain/business-calendar.types.js'
import type { BusinessCalendarActor } from './business-calendar-actor.types.js'
import { resolveToday } from './civil-date.service.js'
import type {
  HolidayImportCitiesPage,
  HolidayImportScope,
  HolidayImportStatus,
  HolidayImportStatusPort,
  HolidayImportSuppression,
  HolidayImportSuppressionPort,
} from './holiday-import.port.js'

type Dependencies = {
  readonly now: () => Date
  readonly statusRepository: HolidayImportStatusPort
  readonly suppressionRepository: HolidayImportSuppressionPort
}

type Execution<TInput, TResult> = { readonly execute: (input: TInput) => Promise<TResult> }

export type HolidayImportUseCases = {
  readonly cities: Execution<
    { readonly companyId: string; readonly page: number; readonly perPage: number },
    HolidayImportCitiesPage
  >
  readonly disable: Execution<
    BusinessCalendarActor & { readonly holidayId: string; readonly scope: HolidayImportScope },
    HolidayImportSuppression
  >
  readonly restore: Execution<BusinessCalendarActor & { readonly id: string }, void>
  readonly status: Execution<{ readonly companyId: string }, HolidayImportStatus>
  readonly suppressions: Execution<
    { readonly companyId: string },
    readonly HolidayImportSuppression[]
  >
}

function resolveHorizon(today: string): BusinessCalendarCoverage {
  const currentYear = Number(today.slice(0, 4))
  return { fromYear: currentYear, toYear: currentYear + HOLIDAY_IMPORT_HORIZON_EXTRA_YEARS }
}

export function createHolidayImportUseCases({
  now,
  statusRepository,
  suppressionRepository,
}: Dependencies): HolidayImportUseCases {
  return {
    cities: {
      execute: (input) =>
        statusRepository.listCities({
          ...input,
          years: resolveHorizon(resolveToday({ now: now() })),
        }),
    },
    disable: {
      execute: (input) => {
        const today = resolveToday({ now: now() })
        return suppressionRepository.disable({
          ...input,
          currentYear: Number(today.slice(0, 4)),
          today,
        })
      },
    },
    restore: { execute: (input) => suppressionRepository.restore(input) },
    status: {
      execute: ({ companyId }) => {
        const today = resolveToday({ now: now() })
        return statusRepository.readStatus({
          companyId,
          month: `${today.slice(0, 7)}-01`,
          years: resolveHorizon(today),
        })
      },
    },
    suppressions: { execute: (input) => suppressionRepository.list(input) },
  }
}
