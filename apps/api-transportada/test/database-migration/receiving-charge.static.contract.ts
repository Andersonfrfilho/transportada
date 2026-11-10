/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317 T1: a migration da cobrança no recebimento é aditiva. Só cria coluna/tabela/CHECK/índice; o único
 * dado que toca é a semeadura do tipo `unexpected_charge` no fim (UPDATE do tipo e INSERT das vagas). Nada de
 * `DROP TABLE`/`DROP COLUMN`. O rollback recusa com dado gravado.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_receiving_charge_to_settlements'
const POSTGRES_IDENTIFIER_MAX_LENGTH = 63

async function read(file: string): Promise<string> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('receiving_charge_to_settlements is required')
  return Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
}

function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--.*$/gmu, '')
}

describe('a cobrança no recebimento entra aditiva (spec 317 T1)', () => {
  test('vem depois da 315 (localização e chegada) na ordem do diário', async () => {
    const names = await listMigrationDirectories()
    const mine = names.findIndex((name) => name.endsWith(MIGRATION_SUFFIX))
    const location = names.findIndex((name) => name.endsWith('_occurrence_location_arrival'))
    expect(location).toBeGreaterThanOrEqual(0)
    expect(mine).toBeGreaterThan(location)
  })

  test('não apaga nada e só mexe em dado na semeadura do tipo', async () => {
    const text = withoutComments(await read('migration.sql'))
    expect(text).not.toMatch(/DROP (TABLE|COLUMN)/u)
    expect(text).not.toMatch(/\bDELETE FROM\b/u)
    const updates = text.match(/UPDATE "[a-z_]+"/gu) ?? []
    expect(new Set(updates)).toEqual(new Set(['UPDATE "company_occurrence_types"']))
    expect(text).toContain(`'unexpected_charge'`)
  })

  test('o nome padrão é a única coisa renomeada, e só onde ainda é o semeado', async () => {
    const text = await read('migration.sql')
    expect(text).toContain(`"name" = 'Cobrança inesperada'`)
    expect(text).toContain(`SET "name" = 'Cobrança no recebimento'`)
  })

  test('a semeadura é idempotente e cria as duas vagas obrigatórias', async () => {
    const text = await read('migration.sql')
    expect(text).toContain(
      'ON CONFLICT ("company_id", "occurrence_type_id", "slot_key") DO NOTHING',
    )
    expect(text).toContain(`'charge_sign', 'Foto da placa de cobrança'`)
    expect(text).toContain(`'payment_receipt', 'Foto do comprovante de pagamento'`)
  })

  test('todo nome de CHECK, índice e FK cabe em 63 caracteres', async () => {
    const text = await read('migration.sql')
    const names = [...text.matchAll(/(?:CONSTRAINT|INDEX) "([a-z0-9_]+)"/gu)].map(
      (match) => match[1] ?? '',
    )
    expect(names.length).toBeGreaterThan(20)
    for (const name of names)
      expect(name.length).toBeLessThanOrEqual(POSTGRES_IDENTIFIER_MAX_LENGTH)
  })

  test('o rollback recusa com dado gravado e sai do diário', async () => {
    const text = await read('rollback.sql')
    expect(text).toContain('refusing to roll back spec 317')
    expect(text).toContain(`'20261110194838_receiving_charge_to_settlements'`)
    expect(text).toContain('DROP TABLE "trip_stop_occurrence_photos"')
  })
})
