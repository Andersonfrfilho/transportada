/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 etapa B: a migration que tira `forward_email_*` é a mais nova entre as do retorno à contratante. Os
 * rollbacks dela e da 248 desfazem-se mais nova primeiro, como em produção; sem isso, reaplicar a 248 recria
 * colunas e CHECKs que a drop já tirou, e a drop nunca roda de novo.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'

import { migrationsDirectory, readMigrationNames } from './support.js'

const DROP_FORWARD_EMAIL_SUFFIX = '_occurrence_drop_forward_email'

export async function rollbackOccurrenceDropForwardEmail(
  database: SQL,
  directories: readonly string[],
): Promise<void> {
  const directory = directories.find((name) => name.endsWith(DROP_FORWARD_EMAIL_SUFFIX))
  if (directory === undefined) return
  if (!(await readMigrationNames(database)).includes(directory)) return
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  await database.unsafe(rollback)
}
