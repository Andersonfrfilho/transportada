/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T7.4 (RF25, RF28): as ocorrências que podem precisar de aviso e o registro de aviso enviado. A chave única
 * `(ocorrência, responsável, dia, tipo)` é quem impede o aviso duplicado, também com duas rotinas ao mesmo tempo.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import {
  companyExpenseOccurrences,
  companyExpenseRemindersSent,
  companyExpenses,
} from '../../database/company-expense.schema.js'
import type { ReminderPorts } from '../application/expense-reminder.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/** Só ocorrência aberta: paga e cancelada não avisam. O status é conferido de novo pelo caso de uso. */
export function createDrizzleExpenseReminderOccurrences(
  db: Database,
): ReminderPorts['occurrences'] {
  return {
    async listForReminders({ companyId }) {
      const rows = await db
        .select({
          companyId: companyExpenseOccurrences.companyId,
          competence: companyExpenseOccurrences.competence,
          dueDate: companyExpenseOccurrences.dueDate,
          expectedAmount: companyExpenseOccurrences.expectedAmount,
          expenseId: companyExpenseOccurrences.expenseId,
          expenseName: companyExpenses.name,
          id: companyExpenseOccurrences.id,
          paidAmount: companyExpenseOccurrences.paidAmount,
          paidAt: companyExpenseOccurrences.paidAt,
          paidBy: companyExpenseOccurrences.paidByUserId,
          responsibleUserId: companyExpenses.responsibleUserId,
          settlementNote: companyExpenseOccurrences.settlementNote,
          status: companyExpenseOccurrences.status,
        })
        .from(companyExpenseOccurrences)
        .innerJoin(
          companyExpenses,
          and(
            eq(companyExpenses.companyId, companyExpenseOccurrences.companyId),
            eq(companyExpenses.id, companyExpenseOccurrences.expenseId),
          ),
        )
        .where(
          and(
            eq(companyExpenseOccurrences.companyId, companyId),
            eq(companyExpenseOccurrences.status, 'open'),
          ),
        )
      return rows.map((row) => ({
        ...row,
        paidAt: row.paidAt === null ? null : row.paidAt.toISOString(),
      }))
    },
  }
}

export function createDrizzleExpenseRemindersSent(db: Database): ReminderPorts['sent'] {
  return {
    async record(key) {
      const inserted = await db
        .insert(companyExpenseRemindersSent)
        .values({
          channel: key.channel,
          companyId: key.companyId,
          day: key.day,
          kind: key.kind,
          occurrenceId: key.occurrenceId,
          recipientUserId: key.recipientUserId,
        })
        .onConflictDoNothing()
        .returning({ id: companyExpenseRemindersSent.id })
      return inserted.length > 0
    },
    async release(key) {
      await db
        .delete(companyExpenseRemindersSent)
        .where(
          and(
            eq(companyExpenseRemindersSent.companyId, key.companyId),
            eq(companyExpenseRemindersSent.occurrenceId, key.occurrenceId),
            eq(companyExpenseRemindersSent.recipientUserId, key.recipientUserId),
            eq(companyExpenseRemindersSent.day, key.day),
            eq(companyExpenseRemindersSent.kind, key.kind),
          ),
        )
    },
  }
}
