/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T1.5: a migration da rotina `company-expense.occurrence.generate` amplia as mesmas CHECK de `job` que as anteriores
 * restauram no rollback delas; ela sai primeiro (ordem inversa), senão a CHECK antiga recusaria a linha do relógio.
 * Só desfaz se ainda estiver no journal, então chamar de novo não faz nada.
 */
import type { SQL } from 'bun'
import { join } from 'node:path'

import { rollbackCompanyExpenseReminderJobIfApplied } from './company-expense-reminder-job-rollback.assertion.js'
import { migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_company_expense_occurrence_job'

export async function rollbackCompanyExpenseOccurrenceJobIfApplied(
  database: SQL,
  directories: readonly string[],
): Promise<void> {
  // A T7.4 é a mais nova e ampliou a CHECK depois desta: sai primeiro.
  await rollbackCompanyExpenseReminderJobIfApplied(database, directories)
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) return
  if (!(await readMigrationNames(database)).includes(directory)) return

  await database.unsafe(
    await Bun.file(join(migrationsDirectory.pathname, directory, 'rollback.sql')).text(),
  )
}
