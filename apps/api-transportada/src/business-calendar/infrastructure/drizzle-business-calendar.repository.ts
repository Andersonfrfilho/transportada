/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  BusinessCalendarRulesPort,
  LoadBusinessCalendarRulesParams,
  LoadedBusinessCalendarRules,
} from '../application/business-calendar-rules.port.js'
import type { BusinessCalendarDatabase } from './business-calendar-database.types.js'
import { loadBusinessCalendarRules } from './business-calendar-rules.query.js'

export class DrizzleBusinessCalendarRepository implements BusinessCalendarRulesPort {
  public constructor(private readonly database: BusinessCalendarDatabase) {}

  public loadRules(params: LoadBusinessCalendarRulesParams): Promise<LoadedBusinessCalendarRules> {
    return loadBusinessCalendarRules(this.database, params)
  }
}
