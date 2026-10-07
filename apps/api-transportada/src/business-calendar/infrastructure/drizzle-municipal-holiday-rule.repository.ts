/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq } from 'drizzle-orm'

import { municipalHolidayRules } from '../../database/municipal-holiday-rule.schema.js'
import type { BusinessCalendarActor } from '../application/business-calendar-actor.types.js'
import type {
  CreateMunicipalHolidayRuleResult,
  MaterializationSummary,
  MunicipalHolidayRuleChanges,
  MunicipalHolidayRuleFields,
  MunicipalHolidayRuleOverview,
  MunicipalHolidayRulePort,
} from '../application/municipal-holiday-rule.port.js'
import type {
  BusinessCalendarDatabase,
  BusinessCalendarTransaction,
} from './business-calendar-database.types.js'
import { acquireBusinessCalendarLock } from './business-calendar-lock.support.js'
import { toRuleRecord } from './business-calendar-rule.mapper.js'
import { buildTypedDayKey, countTypedHolidaysByDay } from './municipal-holiday-typed.queries.js'
import { materializeRules } from './municipal-holiday-rule.materialize.js'
import { updateRule } from './municipal-holiday-rule.update.js'
import { createRule, removeRule } from './municipal-holiday-rule.writes.js'

/**
 * Regra "todo ano" e as datas que ela gera, na mesma transação e sob o lock por empresa, que
 * serializa a conferência de conflito, a geração e a regeneração. Toda escrita grava `audit_logs`.
 */
export class DrizzleMunicipalHolidayRuleRepository implements MunicipalHolidayRulePort {
  public constructor(private readonly database: BusinessCalendarDatabase) {}

  public async list(input: {
    readonly cityIbgeCode?: string
    readonly companyId: string
    readonly currentYear: number
  }): Promise<readonly MunicipalHolidayRuleOverview[]> {
    const rows = await this.database
      .select()
      .from(municipalHolidayRules)
      .where(
        and(
          eq(municipalHolidayRules.companyId, input.companyId),
          ...(input.cityIbgeCode === undefined
            ? []
            : [eq(municipalHolidayRules.cityIbgeCode, input.cityIbgeCode)]),
        ),
      )
      .orderBy(
        asc(municipalHolidayRules.cityIbgeCode),
        asc(municipalHolidayRules.month),
        asc(municipalHolidayRules.day),
      )

    if (rows.length === 0) return []

    const typedByDay = await countTypedHolidaysByDay({ ...input, executor: this.database })
    return rows.map((row) => ({
      ...toRuleRecord(row),
      typedHolidaysKept: typedByDay.get(buildTypedDayKey(row)) ?? 0,
    }))
  }

  public create(
    input: BusinessCalendarActor & MunicipalHolidayRuleFields & { readonly currentYear: number },
  ): Promise<CreateMunicipalHolidayRuleResult> {
    return this.inTransaction(input.companyId, (transaction) => createRule({ input, transaction }))
  }

  public update(
    input: BusinessCalendarActor & {
      readonly changes: MunicipalHolidayRuleChanges
      readonly currentYear: number
      readonly id: string
    },
  ): Promise<MunicipalHolidayRuleOverview | null> {
    return this.inTransaction(input.companyId, (transaction) => updateRule({ input, transaction }))
  }

  public async remove(
    input: BusinessCalendarActor & { readonly currentYear: number; readonly id: string },
  ): Promise<void> {
    await this.inTransaction(input.companyId, (transaction) => removeRule({ input, transaction }))
  }

  public materialize(
    input: BusinessCalendarActor & { readonly currentYear: number },
  ): Promise<MaterializationSummary> {
    return this.inTransaction(input.companyId, (transaction) =>
      materializeRules({ input, transaction }),
    )
  }

  private inTransaction<TResult>(
    companyId: string,
    work: (transaction: BusinessCalendarTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    return this.database.transaction(async (transaction) => {
      await acquireBusinessCalendarLock({ companyId, transaction })
      return work(transaction)
    })
  }
}
