/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2 (ADR-0094 §9): a migration da ocorrência de recebimento mexe numa tabela central
 * existente. O que este contrato prende: espera limitada antes do primeiro ALTER, nada destrutivo,
 * o `NOT NULL` trocado pelo CHECK de dono na mesma pasta, CHECK/FK com NOT VALID + VALIDATE, e um
 * rollback que se recusa a apagar ocorrência de recebimento e volta o `NOT NULL` por último.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const SUFFIX = '_cargo_arrival_receiving_occurrence'

const commandsOnly = (sqlText: string): string =>
  sqlText
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')

async function readFolder(): Promise<{
  readonly directory: string
  readonly migration: string
  readonly rollback: string
}> {
  const directory = (await listMigrationDirectories()).find((name) => name.endsWith(SUFFIX))
  if (directory === undefined) throw new Error(`migration ${SUFFIX} not found`)
  const read = (file: string): Promise<string> =>
    Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
  return { directory, migration: await read('migration.sql'), rollback: await read('rollback.sql') }
}

describe('a ocorrência de recebimento na migration (spec 237 T3.2)', () => {
  test('espera no máximo 3 s, e nada é apagado nem reescrito', async () => {
    const { migration } = await readFolder()
    const commands = commandsOnly(migration)
    const timeout = migration.indexOf("SET LOCAL lock_timeout = '3s'")
    expect(timeout).toBeGreaterThan(-1)
    expect(timeout).toBeLessThan(migration.indexOf('ALTER TABLE'))
    expect(migration.trimEnd()).toEndWith('SET LOCAL lock_timeout = DEFAULT;')
    expect(commands).not.toMatch(/\bDROP (TABLE|COLUMN|INDEX)\b|^\s*(INSERT|UPDATE|DELETE)\b/mu)
  })

  test('o NOT NULL só sai junto do CHECK de exatamente um dono, validado', async () => {
    const commands = commandsOnly((await readFolder()).migration)
    const dropNotNull = commands.indexOf('ALTER COLUMN "trip_document_id" DROP NOT NULL')
    const ownerCheck = commands.indexOf(
      'ADD CONSTRAINT "trip_document_occurrences_owner_check" CHECK (num_nonnulls("trip_document_id", "cargo_arrival_document_id") = 1) NOT VALID',
    )
    expect(dropNotNull).toBeGreaterThan(-1)
    expect(ownerCheck).toBeGreaterThan(dropNotNull)
    expect(commands).toContain('VALIDATE CONSTRAINT "trip_document_occurrences_owner_check"')
  })

  test('todo CHECK e FK novo nasce NOT VALID e é validado na mesma pasta', async () => {
    const commands = commandsOnly((await readFolder()).migration)
    const added = [...commands.matchAll(/ADD CONSTRAINT "([a-z_]+)" (CHECK|FOREIGN KEY)/gu)].map(
      (match) => match[1],
    )
    const validated = [...commands.matchAll(/VALIDATE CONSTRAINT "([a-z_]+)"/gu)].map(
      (match) => match[1],
    )
    expect(added.length).toBeGreaterThan(0)
    expect(validated).toEqual(added)
    for (const match of commands.matchAll(/ADD CONSTRAINT "[a-z_]+" (CHECK|FOREIGN KEY)[^;]*;/gu)) {
      expect(match[0]).toContain('NOT VALID')
    }
  })

  test('o rollback recusa apagar ocorrência de recebimento e volta o NOT NULL por último', async () => {
    const { directory, rollback } = await readFolder()
    const guard = rollback.indexOf(`"trip_document_id" IS NULL OR "stage" = 'receiving'`)
    const raise = rollback.indexOf('RAISE EXCEPTION', guard)
    const dropFk = rollback.indexOf('"cargo_arrival_documents_return_occurrence_fk"')
    const dropOwner = rollback.indexOf('"trip_document_occurrences_owner_check"')
    const setNotNull = rollback.indexOf('ALTER COLUMN "trip_document_id" SET NOT NULL')
    expect(rollback).toMatch(/^--[\s\S]*DESTRUTIVO[\s\S]*\bBEGIN;/u)
    expect(rollback.indexOf("SET LOCAL lock_timeout = '3s'")).toBeLessThan(guard)
    expect(guard).toBeGreaterThan(-1)
    expect(raise).toBeGreaterThan(guard)
    expect(dropFk).toBeGreaterThan(raise)
    expect(dropOwner).toBeGreaterThan(dropFk)
    expect(setNotNull).toBeGreaterThan(dropOwner)
    expect(rollback).toContain(`"name" = '${directory}'`)
    expect(rollback).not.toContain('CASCADE')
    expect(rollback.trimEnd()).toEndWith('COMMIT;')
  })
})
