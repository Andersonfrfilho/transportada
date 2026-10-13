/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.4: a migration da rotina de transcrição amplia as mesmas CHECK de `job` que as anteriores
 * restauram no rollback delas; ela sai primeiro (ordem inversa), senão a CHECK antiga recusaria a linha do
 * relógio. Só desfaz se ainda estiver no journal, então chamar de novo não faz nada.
 */
import type { SQL } from 'bun'
import { join } from 'node:path'

import { rollbackAutomaticMailSweepJobIfApplied } from './occurrence-automatic-mail-sweep-job-rollback.assertion.js'
import { migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_conversation_audio_transcribe_job'

export async function rollbackAudioTranscribeJobIfApplied(
  database: SQL,
  directories: readonly string[],
): Promise<void> {
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) return
  if (!(await readMigrationNames(database)).includes(directory)) return

  await rollbackAutomaticMailSweepJobIfApplied(database, directories)

  await database.unsafe(
    await Bun.file(join(migrationsDirectory.pathname, directory, 'rollback.sql')).text(),
  )
}
