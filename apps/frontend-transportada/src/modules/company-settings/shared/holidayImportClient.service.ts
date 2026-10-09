/* Copyright (c) 2026 Ada Technology. MIT License. */
import { BUSINESS_CALENDAR_ERROR } from './businessCalendar.constant'
import {
  BusinessCalendarRequestError,
  requestBusinessCalendar,
  type BusinessCalendarDependencies,
} from './businessCalendarRequest.service'
import { isDataEnvelope } from './businessCalendarGuards.validation'
import { HOLIDAY_IMPORT_PATH } from './holidayImport.constant'
import type {
  HolidayImportScope,
  HolidayImportStatus,
  HolidayImportSuppression,
  HolidayImportSuppressionsPage,
} from './holidayImport.types'
import {
  isHolidayImportStatus,
  isHolidayImportSuppression,
  isPagedEnvelope,
} from './holidayImportGuards.validation'

export type HolidayImportClient = Readonly<{
  /** Apaga a linha importada e a mantém desligada: só de hoje em diante (409 `HOLIDAY_IMPORT_PAST_DATE`). */
  disable: (
    input: Readonly<{ holidayId: string; scope: HolidayImportScope }>,
  ) => Promise<HolidayImportSuppression>
  getStatus: () => Promise<HolidayImportStatus>
  listSuppressions: (
    input: Readonly<{ page: number; perPage: number }>,
  ) => Promise<HolidayImportSuppressionsPage>
  /** A data volta na próxima execução diária da rotina, não na hora. */
  restore: (suppressionId: string) => Promise<void>
}>

function invalidResponse(): BusinessCalendarRequestError {
  return new BusinessCalendarRequestError({
    code: BUSINESS_CALENDAR_ERROR.RESPONSE_INVALID,
    status: 0,
  })
}

function readSuppressionsPage(body: unknown): HolidayImportSuppressionsPage {
  if (!isPagedEnvelope(body) || !Array.isArray(body.data)) throw invalidResponse()
  if (!body.data.every(isHolidayImportSuppression)) throw invalidResponse()
  return { ...body.pagination, items: body.data }
}

export function createHolidayImportClient(
  dependencies: BusinessCalendarDependencies,
): HolidayImportClient {
  return {
    disable: async (input) => {
      const { body } = await requestBusinessCalendar({
        body: { holidayId: input.holidayId, scope: input.scope },
        dependencies,
        method: 'POST',
        path: HOLIDAY_IMPORT_PATH.SUPPRESSIONS,
      })
      if (!isDataEnvelope(body) || !isHolidayImportSuppression(body.data)) throw invalidResponse()
      return body.data
    },
    getStatus: async () => {
      const { body } = await requestBusinessCalendar({
        dependencies,
        method: 'GET',
        path: HOLIDAY_IMPORT_PATH.STATUS,
      })
      if (!isDataEnvelope(body) || !isHolidayImportStatus(body.data)) throw invalidResponse()
      return body.data
    },
    listSuppressions: async ({ page, perPage }) => {
      const { body } = await requestBusinessCalendar({
        dependencies,
        method: 'GET',
        path: `${HOLIDAY_IMPORT_PATH.SUPPRESSIONS}?page=${String(page)}&perPage=${String(perPage)}`,
      })
      return readSuppressionsPage(body)
    },
    restore: async (suppressionId) => {
      await requestBusinessCalendar({
        dependencies,
        method: 'DELETE',
        path: `${HOLIDAY_IMPORT_PATH.SUPPRESSIONS}/${encodeURIComponent(suppressionId)}`,
      })
    },
  }
}
