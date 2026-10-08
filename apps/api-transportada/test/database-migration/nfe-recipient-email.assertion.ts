/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * The rollback of the recipient e-mail drops its CHECK and its column, and nothing else.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_nfe_recipient_email'

export const NFE_RECIPIENT_EMAIL_CONSTRAINT = 'nfe_documents_recipient_email_check'

export type NfeRecipientEmailProbe = Readonly<{
  connectionString: string
  database: SQL
  directories: readonly string[]
}>

async function hasConstraint(database: SQL): Promise<boolean> {
  const rows = (await database`
    select 1 from pg_constraint where conname = ${NFE_RECIPIENT_EMAIL_CONSTRAINT}
  `) as unknown[]
  return rows.length === 1
}

async function hasColumn(database: SQL): Promise<boolean> {
  const rows = (await database`
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'nfe_documents'
      and column_name = 'recipient_email'
  `) as unknown[]
  return rows.length === 1
}

export async function assertNfeRecipientEmailRollback(
  probe: NfeRecipientEmailProbe,
): Promise<void> {
  const { database } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('nfe_recipient_email is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()

  expect(await hasConstraint(database)).toBe(true)
  expect(await hasColumn(database)).toBe(true)

  await database.unsafe(rollback)

  expect(await hasConstraint(database)).toBe(false)
  expect(await hasColumn(database)).toBe(false)
}
