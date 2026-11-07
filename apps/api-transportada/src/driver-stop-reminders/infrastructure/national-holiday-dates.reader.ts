/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 RF8.2 (dono, 2026-11-07): a cobrança fecha só nos feriados **nacionais**. Eles são lei e moram no código
 * (`listNationalHolidays`), então a leitura não toca o banco nem depende de cidade ou de fornecedor.
 */
import { listNationalHolidays } from '../../business-calendar/domain/national-holiday.policy.js'
import type { StopReminderHolidayReader } from './drizzle-driver-stop-reminder-delivery.repository.js'

/** O ano seguinte entra porque a busca da próxima abertura atravessa a virada do ano. */
export const readNationalHolidayDates: StopReminderHolidayReader = async ({ now, timeZone }) => {
  const currentYear = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric' }).format(now),
  )
  return [currentYear, currentYear + 1].flatMap((year) =>
    listNationalHolidays(year).map((holiday) => holiday.date),
  )
}
