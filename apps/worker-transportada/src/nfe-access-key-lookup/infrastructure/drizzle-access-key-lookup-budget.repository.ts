/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, lte, sql } from 'drizzle-orm'

import { type NfeFiscalEnvironment, nfeAccessKeyLookupBudgets } from '../../database/nfe.schema.js'
import {
  ACCESS_KEY_LOOKUP_BLOCK_656_MS,
  ACCESS_KEY_LOOKUP_BUDGET_LIMIT,
  ACCESS_KEY_LOOKUP_BUDGET_WINDOW_MS,
} from '../domain/nfe-access-key-lookup-budget.constant.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type BudgetScopeInput = {
  readonly companyId: string
  readonly environment: NfeFiscalEnvironment
  readonly now: Date
}

type ReserveBudgetResult =
  | { readonly reserved: true; readonly budgetLeft: number }
  | { readonly reserved: false; readonly notBefore: Date }

const budget = nfeAccessKeyLookupBudgets

export class DrizzleAccessKeyLookupBudgetRepository {
  constructor(private readonly db: Database) {}

  /**
   * Uma instrução só: o `ON CONFLICT DO UPDATE ... WHERE` reavalia a condição sobre a linha já
   * travada, então duas reservas concorrentes no último lugar nunca passam as duas.
   */
  async reserve(input: BudgetScopeInput): Promise<ReserveBudgetResult> {
    const windowCutoff = new Date(input.now.getTime() - ACCESS_KEY_LOOKUP_BUDGET_WINDOW_MS)
    const isWindowExpired = lte(budget.windowStartedAt, windowCutoff)

    const rows = await this.db
      .insert(budget)
      .values({
        companyId: input.companyId,
        environment: input.environment,
        windowStartedAt: input.now,
        usedInWindow: 1,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: [budget.companyId, budget.environment],
        set: {
          windowStartedAt: sql`case when ${isWindowExpired} then ${input.now.toISOString()}::timestamptz else ${budget.windowStartedAt} end`,
          usedInWindow: sql`case when ${isWindowExpired} then 1 else ${budget.usedInWindow} + 1 end`,
          updatedAt: input.now,
        },
        setWhere: sql`(${budget.blockedUntil} is null or ${budget.blockedUntil} <= ${input.now.toISOString()}::timestamptz)
          and (${isWindowExpired} or ${budget.usedInWindow} < ${ACCESS_KEY_LOOKUP_BUDGET_LIMIT})`,
      })
      .returning({ usedInWindow: budget.usedInWindow })

    const reservation = rows[0]
    if (reservation !== undefined) {
      return {
        reserved: true,
        budgetLeft: ACCESS_KEY_LOOKUP_BUDGET_LIMIT - reservation.usedInWindow,
      }
    }
    return { reserved: false, notBefore: await this.readNotBefore(input) }
  }

  /** O bloqueio não mexe na janela: ela só reinicia quando o bloqueio já terminou. */
  async block656(input: BudgetScopeInput): Promise<void> {
    const blockedUntil = new Date(input.now.getTime() + ACCESS_KEY_LOOKUP_BLOCK_656_MS)

    await this.db
      .insert(budget)
      .values({
        companyId: input.companyId,
        environment: input.environment,
        windowStartedAt: input.now,
        usedInWindow: 0,
        blockedUntil,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: [budget.companyId, budget.environment],
        set: {
          blockedUntil: sql`greatest(${budget.blockedUntil}, ${blockedUntil.toISOString()}::timestamptz)`,
          updatedAt: input.now,
        },
      })
  }

  private async readNotBefore(input: BudgetScopeInput): Promise<Date> {
    const [row] = await this.db
      .select({ windowStartedAt: budget.windowStartedAt, blockedUntil: budget.blockedUntil })
      .from(budget)
      .where(and(eq(budget.companyId, input.companyId), eq(budget.environment, input.environment)))

    if (row === undefined) {
      throw new Error('access key lookup budget row vanished after a refused reservation')
    }
    const windowEnd = row.windowStartedAt.getTime() + ACCESS_KEY_LOOKUP_BUDGET_WINDOW_MS
    return new Date(Math.max(windowEnd, row.blockedUntil?.getTime() ?? 0))
  }
}
