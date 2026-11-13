/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import type {
  ActiveFixedExpense,
  CompanyExpenseOccurrencePorts,
} from '../application/company-expense-occurrence.port.js'
import type { ExpenseRecurrence } from '../domain/expense-schedule.policy.js'

export type CompanyExpenseOccurrenceDatabase = ReturnType<typeof createDrizzleProvider>['db']

type ActiveFixedRow = {
  readonly anchor_competence: string
  readonly company_id: string
  readonly due_day: number | null
  readonly expected_amount: string
  readonly id: string
  readonly recurrence: string
}

/**
 * ⚠️ Espelha `listActiveFixed` e `insertIfAbsent` de `drizzle-expenses.repository.ts` da API (SQL por valor, sem schema
 * copiado): mesmas condições (`active`, `kind = 'fixed'`) e mesma chave `ON CONFLICT (expense_id, competence, slot)`.
 * A âncora é o mês de criação da conta em America/Sao_Paulo — sem coluna própria, é o mês em que o cadastro gerou a
 * primeira janela, e fica estável entre as execuções (a janela anda, a âncora não). A paridade é cobrada por
 * `test/company-expense-occurrence/sql-parity.contract.ts`.
 */
export function createDrizzleCompanyExpenseOccurrencePorts(
  database: CompanyExpenseOccurrenceDatabase,
): CompanyExpenseOccurrencePorts {
  return {
    insertIfAbsent: async (input) => {
      const rows = await database.execute(sql`
        insert into company_expense_occurrences
          (company_id, expense_id, competence, slot, due_date, expected_amount)
        values (
          ${input.companyId}::uuid, ${input.expenseId}::uuid, ${input.competence}, ${input.slot}::smallint,
          ${input.dueDate}::date, ${input.expectedAmount}::numeric
        )
        on conflict (expense_id, competence, slot) do nothing
        returning id
      `)
      return rows.length > 0
    },
    listActiveFixed: async ({ companyId }) => {
      const rows = (await database.execute(sql`
        select id, company_id, recurrence, due_day, expected_amount::text as expected_amount,
               to_char(created_at at time zone 'America/Sao_Paulo', 'YYYY-MM') as anchor_competence
        from company_expenses
        where company_id = ${companyId}::uuid and active = true and kind = 'fixed'
        order by created_at, id
      `)) as unknown as readonly ActiveFixedRow[]
      return rows.map(
        (row): ActiveFixedExpense => ({
          anchorCompetence: row.anchor_competence,
          companyId: row.company_id,
          dueDay: row.due_day,
          expectedAmount: row.expected_amount,
          id: row.id,
          recurrence: row.recurrence as ExpenseRecurrence,
        }),
      )
    },
    listCompaniesWithActiveFixed: async () => {
      const rows = (await database.execute(sql`
        select distinct company_id from company_expenses where active = true and kind = 'fixed' order by company_id
      `)) as unknown as readonly { readonly company_id: string }[]
      return rows.map((row) => row.company_id)
    },
  }
}
