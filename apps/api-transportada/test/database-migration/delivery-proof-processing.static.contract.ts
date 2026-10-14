/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 265 T004 / RNF4: a migration do estado do comprovante entra só aditiva — colunas anuláveis em
 * `trip_delivery_proofs`, uma tabela de outbox nova, nenhum UPDATE, DELETE ou DROP fora do rollback,
 * nenhum ENUM nativo, identificadores dentro dos 63 bytes do Postgres — e o rollback é guardado.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_delivery_proof_processing'
const LAST_STAGING_MIGRATION = '20261013230912_trip_document_release_events'
const POSTGRES_IDENTIFIER_MAX_BYTES = 63

async function readMigration(file: string): Promise<{ directory: string; text: string }> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error(`${MIGRATION_SUFFIX} migration is required`)
  const text = await Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
  return { directory, text }
}

function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--(?!>).*$/gmu, '')
}

describe('a migration do estado do comprovante entra aditiva (spec 265 T004)', () => {
  test('a pasta é posterior à última migração de staging e tem o sufixo da spec', async () => {
    const { directory } = await readMigration('migration.sql')

    expect(directory > LAST_STAGING_MIGRATION).toBe(true)
    expect(directory.endsWith(MIGRATION_SUFFIX)).toBe(true)
  })

  test('sem UPDATE, DELETE, DROP nem ENUM nativo; cria o outbox e as três colunas anuláveis', async () => {
    const { text } = await readMigration('migration.sql')
    const instructions = withoutComments(text)

    expect(instructions).not.toMatch(
      /\bUPDATE "|\bDELETE FROM\b|\bDROP (?:TABLE|COLUMN|CONSTRAINT|INDEX)\b/u,
    )
    expect(instructions).not.toMatch(/\bCREATE TYPE\b/u)
    expect(instructions).toContain('CREATE TABLE "delivery_proof_outbox"')
    for (const column of ['processing_state', 'original_object_id', 'processing_error']) {
      expect(instructions).toMatch(
        new RegExp(`ALTER TABLE "trip_delivery_proofs" ADD COLUMN "${column}" [a-z0-9()]+;`, 'u'),
      )
    }
  })

  test('as colunas novas não são NOT NULL nem têm DEFAULT (o histórico fica nulo, sem backfill)', async () => {
    const { text } = await readMigration('migration.sql')
    const additions = withoutComments(text)
      .split('\n')
      .filter((line) => line.includes('ALTER TABLE "trip_delivery_proofs" ADD COLUMN'))

    expect(additions).toHaveLength(3)
    for (const line of additions) expect(line).not.toMatch(/NOT NULL|DEFAULT/u)
  })

  test('todo identificador entre aspas cabe nos 63 bytes do Postgres', async () => {
    const { text } = await readMigration('migration.sql')
    const identifiers = [...withoutComments(text).matchAll(/"([^"]+)"/gu)].map(
      (match) => match[1] ?? '',
    )

    expect(identifiers.length).toBeGreaterThan(0)
    for (const identifier of identifiers) {
      expect(new TextEncoder().encode(identifier).length, identifier).toBeLessThanOrEqual(
        POSTGRES_IDENTIFIER_MAX_BYTES,
      )
    }
  })

  test('o rollback recusa com trabalho pendente, derruba o que criou e tira a linha do journal', async () => {
    const { directory, text } = await readMigration('rollback.sql')

    expect(text).toContain('BEGIN;')
    expect(text).toContain('COMMIT;')
    expect(text).toContain("IN ('received', 'processing')")
    expect(text).toContain('"published_at" IS NULL')
    expect(text).toContain('RAISE EXCEPTION')
    expect(text).toContain('DROP TABLE IF EXISTS "delivery_proof_outbox"')
    for (const column of ['processing_state', 'original_object_id', 'processing_error']) {
      expect(text).toContain(`DROP COLUMN IF EXISTS "${column}"`)
    }
    expect(text).toContain(`"name" = '${directory}'`)
    expect(text).toContain('GET DIAGNOSTICS deleted_migrations = ROW_COUNT')
    // A recusa vem antes de qualquer DROP: nada é apagado se o guarda dispara.
    expect(text.indexOf('RAISE EXCEPTION')).toBeLessThan(text.indexOf('DROP TABLE'))
  })
})
