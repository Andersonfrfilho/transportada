/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.10: a migration do alerta do retorno vencido amplia as mesmas CHECK de `job` que as anteriores
 * restauram no rollback delas; ela sai primeiro (ordem inversa), senão a CHECK antiga recusaria a linha do
 * relógio. Só desfaz se ainda estiver no journal, então chamar de novo não faz nada.
 */
import type { SQL } from 'bun'
import { join } from 'node:path'

import { migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_occurrence_contractor_reply_alert_job'

export async function rollbackContractorReplyAlertJobIfApplied(
  database: SQL,
  directories: readonly string[],
): Promise<void> {
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) return
  if (!(await readMigrationNames(database)).includes(directory)) return

  await database.unsafe(
    await Bun.file(join(migrationsDirectory.pathname, directory, 'rollback.sql')).text(),
  )
}
