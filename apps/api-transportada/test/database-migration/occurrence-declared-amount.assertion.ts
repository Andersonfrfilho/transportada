/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T2.2/T2.3: o rollback desfaz só o que a migration do valor pago criou — as CHECKs e as
 * colunas das cinco tabelas somem, e as da 241/246 nas mesmas tabelas seguem de pé. Um tipo gravado
 * **antes** da migration (inclusive com `items_mode = 'off'`, o caso que a CHECK de forma de dois
 * termos recusaria) recebe os padrões quando o migrador a reaplica; nenhum dado é reescrito.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { OCCURRENCE_TYPE_DECLARED_AMOUNT_DEFAULTS } from '../../src/shared/trip-occurrence.constant.js'
import { migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_occurrence_declared_amount'

export const OCCURRENCE_DECLARED_AMOUNT_CONSTRAINTS = [
  'company_occurrence_types_reference_number_mode_check',
  'company_occurrence_types_reference_number_label_check',
  'company_occurrence_types_declared_amount_mode_check',
  'company_occurrence_types_declared_amount_scope_check',
  'company_occurrence_types_declared_amount_label_check',
  'company_occurrence_types_email_item_line_template_check',
  'company_occurrence_types_declared_amount_items_check',
  'occurrence_type_contractor_overrides_reference_mode_check',
  'occurrence_type_contractor_overrides_declared_amount_mode_check',
  'occurrence_type_recipient_overrides_reference_mode_check',
  'occurrence_type_recipient_overrides_declared_amount_mode_check',
  'trip_document_occurrences_reference_number_check',
  'trip_document_occurrences_declared_amount_check',
  'trip_document_occurrence_products_unit_value_check',
  'trip_document_occurrence_products_declared_amount_check',
] as const

/** O que a 241/246 criou nas mesmas tabelas: sobrevive ao rollback da 247. */
const PREVIOUS_SPEC_CONSTRAINTS = [
  'company_occurrence_types_items_mode_check',
  'company_occurrence_types_items_off_shape_check',
  'company_occurrence_types_items_minimum_shape_check',
  'occurrence_type_contractor_overrides_items_mode_check',
  'occurrence_type_recipient_overrides_note_mode_check',
] as const

const SPEC_247_COLUMNS = [
  'company_occurrence_types.declared_amount_label',
  'company_occurrence_types.declared_amount_mode',
  'company_occurrence_types.declared_amount_scope',
  'company_occurrence_types.email_item_line_template',
  'company_occurrence_types.reference_number_label',
  'company_occurrence_types.reference_number_mode',
  'company_occurrence_type_contractor_overrides.declared_amount_mode',
  'company_occurrence_type_contractor_overrides.reference_number_mode',
  'company_occurrence_type_recipient_overrides.declared_amount_mode',
  'company_occurrence_type_recipient_overrides.reference_number_mode',
  'trip_document_occurrences.declared_amount',
  'trip_document_occurrences.reference_number',
  'trip_document_occurrence_products.declared_amount',
  'trip_document_occurrence_products.unit_value',
] as const

const SPEC_247_TABLES = [
  ...new Set(SPEC_247_COLUMNS.map((qualified) => qualified.split('.')[0] ?? '')),
]

export type OccurrenceDeclaredAmountProbe = Readonly<{
  companyId: string
  connectionString: string
  database: SQL
  directories: readonly string[]
}>

type StoredDefaults = Readonly<{
  declared_amount_label: string
  declared_amount_mode: string
  declared_amount_scope: string
  email_item_line_template: string
  reference_number_label: string
  reference_number_mode: string
}>

async function readConstraintNames(database: SQL, names: readonly string[]): Promise<string[]> {
  const rows = (await database`
    select conname from pg_constraint where conname in ${database(names)}
  `) as { conname: string }[]
  return rows.map((row) => row.conname).toSorted()
}

async function readColumns(database: SQL): Promise<readonly string[]> {
  const rows = (await database`
    select table_name || '.' || column_name as qualified
    from information_schema.columns
    where table_schema = 'public' and table_name in ${database(SPEC_247_TABLES)}
  `) as { qualified: string }[]
  const wanted = new Set<string>(SPEC_247_COLUMNS)
  return rows
    .map((row) => row.qualified)
    .filter((qualified) => wanted.has(qualified))
    .toSorted()
}

async function seedTypesBeforeMigration(database: SQL, companyId: string): Promise<string[]> {
  const ids = [crypto.randomUUID(), crypto.randomUUID()]
  // `off` + `unset`: a segunda via do boleto da 241 — a CHECK de forma precisa aceitá-lo.
  await database`
    insert into company_occurrence_types (id, company_id, name, stage, items_mode, redelivery_policy)
    values
      (${ids[0]}, ${companyId}, ${`Prova 247 sem itens ${ids[0]}`}, 'delivery', 'off', 'unset'),
      (${ids[1]}, ${companyId}, ${`Prova 247 com itens ${ids[1]}`}, 'delivery', 'optional', 'unset')
  `
  return ids
}

async function readStoredDefaults(
  database: SQL,
  ids: readonly string[],
): Promise<StoredDefaults[]> {
  return (await database`
    select reference_number_mode, reference_number_label, declared_amount_mode,
      declared_amount_scope, declared_amount_label, email_item_line_template
    from company_occurrence_types where id in ${database(ids)}
  `) as StoredDefaults[]
}

export async function assertOccurrenceDeclaredAmountRollback(
  probe: OccurrenceDeclaredAmountProbe,
): Promise<void> {
  const { companyId, connectionString, database } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('occurrence_declared_amount is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()

  expect(await readConstraintNames(database, OCCURRENCE_DECLARED_AMOUNT_CONSTRAINTS)).toHaveLength(
    OCCURRENCE_DECLARED_AMOUNT_CONSTRAINTS.length,
  )
  expect(await readColumns(database)).toEqual([...SPEC_247_COLUMNS].toSorted())

  await database.unsafe(rollback)

  expect(await readConstraintNames(database, OCCURRENCE_DECLARED_AMOUNT_CONSTRAINTS)).toEqual([])
  expect(await readColumns(database)).toEqual([])
  expect(await readConstraintNames(database, PREVIOUS_SPEC_CONSTRAINTS)).toEqual(
    [...PREVIOUS_SPEC_CONSTRAINTS].toSorted(),
  )

  const seededIds = await seedTypesBeforeMigration(database, companyId)
  await runDatabaseMigrations({ connectionString })

  const defaults = {
    declared_amount_label: OCCURRENCE_TYPE_DECLARED_AMOUNT_DEFAULTS.declaredAmountLabel,
    declared_amount_mode: OCCURRENCE_TYPE_DECLARED_AMOUNT_DEFAULTS.declaredAmountMode,
    declared_amount_scope: OCCURRENCE_TYPE_DECLARED_AMOUNT_DEFAULTS.declaredAmountScope,
    email_item_line_template: '',
    reference_number_label: OCCURRENCE_TYPE_DECLARED_AMOUNT_DEFAULTS.referenceNumberLabel,
    reference_number_mode: OCCURRENCE_TYPE_DECLARED_AMOUNT_DEFAULTS.referenceNumberMode,
  }
  expect(await readStoredDefaults(database, seededIds)).toEqual([defaults, defaults])
  expect(await readConstraintNames(database, OCCURRENCE_DECLARED_AMOUNT_CONSTRAINTS)).toHaveLength(
    OCCURRENCE_DECLARED_AMOUNT_CONSTRAINTS.length,
  )
  expect(await readColumns(database)).toEqual([...SPEC_247_COLUMNS].toSorted())

  await database`delete from company_occurrence_types where id in ${database(seededIds)}`
}
