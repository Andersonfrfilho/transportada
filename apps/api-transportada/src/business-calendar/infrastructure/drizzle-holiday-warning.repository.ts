/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  HolidayWarningPort,
  HolidayWarningsResult,
  ReadHolidayWarningsParams,
} from '../application/holiday-warning.port.js'
import type { BusinessCalendarDatabase } from './business-calendar-database.types.js'
import { readHolidayWarnings } from './holiday-warning.reader.js'

export class DrizzleHolidayWarningRepository implements HolidayWarningPort {
  public constructor(private readonly database: BusinessCalendarDatabase) {}

  public read(params: ReadHolidayWarningsParams): Promise<HolidayWarningsResult> {
    return readHolidayWarnings(this.database, params)
  }
}
