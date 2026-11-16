/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 319 T7: a migration da rotina `whatsapp-inbox.chat.expire` amplia as mesmas CHECK de `job` que as anteriores
 * restauram no rollback delas; ela sai primeiro (ordem inversa), senão a CHECK antiga recusaria a linha do relógio.
 * Só desfaz se ainda estiver no journal, então chamar de novo não faz nada.
 */
import type { SQL } from 'bun'
import { join } from 'node:path'

import { rollbackCompanyExpenseOccurrenceJobIfApplied } from './company-expense-occurrence-job-rollback.assertion.js'
import { migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_whatsapp_inbox_chat_expire_job'

export async function rollbackWhatsAppInboxChatExpireJobIfApplied(
  database: SQL,
  directories: readonly string[],
): Promise<void> {
  // Spec 325 T1.5: a rotina das contas é a mais nova e sai antes, pelo mesmo motivo.
  await rollbackCompanyExpenseOccurrenceJobIfApplied(database, directories)

  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) return
  if (!(await readMigrationNames(database)).includes(directory)) return

  await database.unsafe(
    await Bun.file(join(migrationsDirectory.pathname, directory, 'rollback.sql')).text(),
  )
}
