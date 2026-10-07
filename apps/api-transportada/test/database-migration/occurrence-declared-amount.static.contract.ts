/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T2.2: a migration do número do cliente e do valor pago é aditiva — colunas do tipo com
 * padrão constante, colunas das exceções nulas e sem padrão, e nenhum `UPDATE` em dado. As CHECKs só
 * entram depois das colunas que elas leem; todo nome cabe nos 63 caracteres do Postgres. O rollback
 * desfaz só o que a 247 criou: `items_mode`, as exigências e os mínimos da 241/246 ficam.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { OCCURRENCE_DECLARED_AMOUNT_CONSTRAINTS } from './occurrence-declared-amount.assertion.js'
import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_occurrence_declared_amount'
const POSTGRES_IDENTIFIER_MAX_LENGTH = 63
const TYPES = '"company_occurrence_types"'
const CONTRACTOR = '"company_occurrence_type_contractor_overrides"'
const RECIPIENT = '"company_occurrence_type_recipient_overrides"'
const OCCURRENCES = '"trip_document_occurrences"'
const PRODUCTS = '"trip_document_occurrence_products"'

/** Os nomes que a 241/246 criou nas mesmas tabelas — o rollback da 247 não pode encostar neles. */
const PREVIOUS_SPEC_NAMES = [
  'items_mode_check',
  'items_off_shape_check',
  'note_mode_check',
  'signature_mode_check',
  'photo_minimum_count_check',
  'items_minimum_count_check',
  'items_minimum_shape_check',
  '"items_mode"',
  '"note_mode"',
  '"signature_mode"',
  '"photo_minimum_count"',
  '"items_minimum_count"',
] as const

async function readMigration(file: string): Promise<{ directory: string; text: string }> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('occurrence_declared_amount is required')
  const text = await Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
  return { directory, text }
}

/** Os comentários explicam o que não se toca; só as instruções contam. */
function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--.*$/gmu, '')
}

function positionOf(sqlText: string, fragment: string): number {
  const position = sqlText.indexOf(fragment)
  if (position < 0) throw new Error(`Missing fragment: ${fragment}`)
  return position
}

describe('o número do cliente e o valor pago entram aditivos (spec 247 T2.2)', () => {
  test('todo nome de CHECK cabe em 63 caracteres', () => {
    for (const name of OCCURRENCE_DECLARED_AMOUNT_CONSTRAINTS) {
      expect(name.length).toBeLessThanOrEqual(POSTGRES_IDENTIFIER_MAX_LENGTH)
    }
  })

  test('colunas com padrão constante no tipo, nulas nas exceções; CHECKs depois; sem UPDATE', async () => {
    const { text } = await readMigration('migration.sql')
    const columns = [
      `ALTER TABLE ${CONTRACTOR} ADD COLUMN "reference_number_mode" varchar(16);`,
      `ALTER TABLE ${CONTRACTOR} ADD COLUMN "declared_amount_mode" varchar(16);`,
      `ALTER TABLE ${RECIPIENT} ADD COLUMN "reference_number_mode" varchar(16);`,
      `ALTER TABLE ${RECIPIENT} ADD COLUMN "declared_amount_mode" varchar(16);`,
      `ALTER TABLE ${TYPES} ADD COLUMN "reference_number_mode" varchar(16) DEFAULT 'off' NOT NULL;`,
      `ALTER TABLE ${TYPES} ADD COLUMN "reference_number_label" varchar(40) DEFAULT 'Número do documento do cliente' NOT NULL;`,
      `ALTER TABLE ${TYPES} ADD COLUMN "declared_amount_mode" varchar(16) DEFAULT 'off' NOT NULL;`,
      `ALTER TABLE ${TYPES} ADD COLUMN "declared_amount_scope" varchar(16) DEFAULT 'item' NOT NULL;`,
      `ALTER TABLE ${TYPES} ADD COLUMN "declared_amount_label" varchar(40) DEFAULT 'Valor pago' NOT NULL;`,
      `ALTER TABLE ${TYPES} ADD COLUMN "email_item_line_template" text DEFAULT '' NOT NULL;`,
      `ALTER TABLE ${PRODUCTS} ADD COLUMN "unit_value" numeric(19,4);`,
      `ALTER TABLE ${PRODUCTS} ADD COLUMN "declared_amount" numeric(14,4);`,
      `ALTER TABLE ${OCCURRENCES} ADD COLUMN "reference_number" varchar(30);`,
      `ALTER TABLE ${OCCURRENCES} ADD COLUMN "declared_amount" numeric(14,4);`,
    ].map((fragment) => positionOf(text, fragment))
    const firstConstraint = Math.min(
      ...OCCURRENCE_DECLARED_AMOUNT_CONSTRAINTS.map((name) => positionOf(text, `"${name}"`)),
    )

    expect(Math.max(...columns)).toBeLessThan(firstConstraint)
    expect(text.match(/ADD COLUMN/gu)).toHaveLength(columns.length)
    const instructions = withoutComments(text)
    expect(instructions).not.toMatch(/\bUPDATE\b|\bDROP\b|\bDELETE\b/u)
    // A forma tem os três termos: tipo existente com `items_mode = 'off'` passa com o modo `off`.
    expect(instructions).toContain(
      `"company_occurrence_types_declared_amount_items_check" CHECK ("declared_amount_mode" = 'off' or "declared_amount_scope" = 'occurrence' or "items_mode" <> 'off')`,
    )
    for (const name of OCCURRENCE_DECLARED_AMOUNT_CONSTRAINTS) {
      expect(instructions).toContain(`ADD CONSTRAINT "${name}"`)
    }
  })

  test('o rollback desfaz só a 247: CHECKs, depois colunas, depois o journal com ROW_COUNT', async () => {
    const { directory, text } = await readMigration('rollback.sql')
    const order = [
      'BEGIN;',
      '"trip_document_occurrence_products_declared_amount_check"',
      '"company_occurrence_types_declared_amount_items_check"',
      'DROP COLUMN IF EXISTS "unit_value"',
      'DROP COLUMN IF EXISTS "reference_number_mode"',
      `WHERE "name" = '${directory}'`,
      'ROW_COUNT',
      'COMMIT;',
    ].map((fragment) => positionOf(text, fragment))

    expect(order).toEqual(order.toSorted((left, right) => left - right))
    const instructions = withoutComments(text)
    for (const name of OCCURRENCE_DECLARED_AMOUNT_CONSTRAINTS) {
      expect(instructions).toContain(`DROP CONSTRAINT IF EXISTS "${name}"`)
    }
    for (const previous of PREVIOUS_SPEC_NAMES) {
      expect(instructions).not.toContain(previous)
    }
    expect(instructions).not.toMatch(/\bCASCADE\b|\bUPDATE\b/u)
    expect(text.trimEnd()).toEndWith('COMMIT;')
  })
})
