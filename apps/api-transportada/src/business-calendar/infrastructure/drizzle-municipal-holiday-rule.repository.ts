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
  MunicipalHolidayRulePort,
  MunicipalHolidayRuleRecord,
} from '../application/municipal-holiday-rule.port.js'
import type {
  BusinessCalendarDatabase,
  BusinessCalendarTransaction,
} from './business-calendar-database.types.js'
import { acquireBusinessCalendarLock } from './business-calendar-lock.support.js'
import { toRuleRecord } from './business-calendar-rule.mapper.js'
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
  }): Promise<readonly MunicipalHolidayRuleRecord[]> {
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

    return rows.map(toRuleRecord)
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
  ): Promise<MunicipalHolidayRuleRecord | null> {
    return this.inTransaction(input.companyId, (transaction) => updateRule({ input, transaction }))
  }

  public async remove(input: BusinessCalendarActor & { readonly id: string }): Promise<void> {
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
