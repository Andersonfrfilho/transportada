/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T1.2: a migration dos lembretes do motorista amplia as mesmas CHECK de `job` que as anteriores
 * restauram no rollback delas; ela sai primeiro (ordem inversa), senão a CHECK antiga recusaria a linha do
 * relógio. Só desfaz se ainda estiver no journal, então chamar de novo não faz nada.
 */
import type { SQL } from 'bun'
import { join } from 'node:path'

import { migrationsDirectory, readMigrationNames } from './support.js'
import { rollbackWhatsAppInboxChatExpireJobIfApplied } from './whatsapp-inbox-chat-expire-job-rollback.assertion.js'

const MIGRATION_SUFFIX = '_driver_stop_reminders'
const IDLE_STAGE_MIGRATION_SUFFIX = '_driver_stop_reminder_idle_stage'

export async function rollbackDriverStopRemindersIfApplied(
  database: SQL,
  directories: readonly string[],
): Promise<void> {
  // Spec 319 T7: a rotina da caixa é a mais nova e sai antes, pelo mesmo motivo.
  await rollbackWhatsAppInboxChatExpireJobIfApplied(database, directories)

  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) return
  if (!(await readMigrationNames(database)).includes(directory)) return

  // A etapa `idle` (spec 299 T2.7) veio depois das tabelas e sai antes delas.
  const idleDirectory = directories.find((name) => name.endsWith(IDLE_STAGE_MIGRATION_SUFFIX))
  if (idleDirectory !== undefined && (await readMigrationNames(database)).includes(idleDirectory)) {
    await database.unsafe(
      await Bun.file(join(migrationsDirectory.pathname, idleDirectory, 'rollback.sql')).text(),
    )
  }

  await database.unsafe(
    await Bun.file(join(migrationsDirectory.pathname, directory, 'rollback.sql')).text(),
  )
}
