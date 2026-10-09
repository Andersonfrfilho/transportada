/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  HolidayWarningPort,
  HolidayWarningsResult,
  ReadHolidayWarningsParams,
} from '../application/holiday-warning.port.js'
import { resolveToday } from '../application/civil-date.service.js'
import type { BusinessCalendarDatabase } from './business-calendar-database.types.js'
import { readHolidayWarnings } from './holiday-warning.reader.js'

export class DrizzleHolidayWarningRepository implements HolidayWarningPort {
  public constructor(
    private readonly database: BusinessCalendarDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public read(params: ReadHolidayWarningsParams): Promise<HolidayWarningsResult> {
    const referenceYear = Number(resolveToday({ now: this.now() }).slice(0, 4))
    return readHolidayWarnings(this.database, { ...params, referenceYear })
  }
}
