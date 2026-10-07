/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T1.2 (ADR-0094 §2): o perfil de recebimento é dado por contratante, preso ao tenant pela
 * FK composta — nunca regra por CNPJ no código, nunca contratante de outra empresa.
 */
import { describe, expect, test } from 'bun:test'

import { contractorReceivingProfiles } from '../../src/database/database.schema.js'
import {
  columnSqlTypes,
  expectGeneratedUuidPrimaryKey,
  expectRequiredUtcTimestamps,
  foreignKeys,
  requiredColumnNames,
  unqualifiedCheckSqlByName,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

const TABLE = 'contractor_receiving_profiles'

/** Spec 237 T4.6: 1..20 entradas, até 5100 caracteres juntas, sem controle, espaço, vírgula nem `<>`. */
const PREVIEW_ALLOWLIST_CHECK = (column: string): string =>
  `cardinality("${column}") between 1 and 20 and char_length(array_to_string("${column}", '|')) <= 5100 and array_to_string("${column}", '|') !~ '[[:cntrl:][:space:],<>]'`

describe('o perfil de recebimento do contratante (spec 237 T1.2)', () => {
  test('alcança o contratante pela empresa, nunca pelo id sozinho', () => {
    expect(foreignKeys(contractorReceivingProfiles)).toContainEqual({
      columns: ['company_id', 'contractor_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'contractors',
      name: `${TABLE}_company_id_contractor_id_contractors_company_id_id_fk`,
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(contractorReceivingProfiles)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: `${TABLE}_company_id_companies_id_fk`,
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('um perfil por contratante', () => {
    expect(uniqueColumnsByName(contractorReceivingProfiles)).toEqual({
      [`${TABLE}_company_contractor_unique`]: ['company_id', 'contractor_id'],
    })
    expectGeneratedUuidPrimaryKey(contractorReceivingProfiles)
    expectRequiredUtcTimestamps(contractorReceivingProfiles)
  })

  /** ADR-0048: regra do contratante é nula até alguém defini-la; só o controle e o algoritmo têm padrão. */
  test('só controle e parâmetro do algoritmo são obrigatórios', () => {
    expect([...requiredColumnNames(contractorReceivingProfiles)].sort()).toEqual(
      [
        'company_id',
        'contractor_id',
        'created_at',
        'id',
        'is_enabled',
        'match_window_days',
        'preview_enabled',
        'requires_damage_check',
        'updated_at',
        'weight_tolerance_percent',
      ].sort(),
    )
  })

  test('tipos: inteiro pequeno para horas e dias, decimal para tolerância, objeto para o mapa', () => {
    expect(columnSqlTypes(contractorReceivingProfiles)).toMatchObject({
      arrival_reference_label: 'text',
      arrival_reference_pattern: 'text',
      delivery_deadline_business_days: 'smallint',
      match_window_days: 'smallint',
      preview_column_map: 'jsonb',
      /** O helper não distingue o array (`text[]` na migration, coberta em `db:test`). */
      preview_forwarder_allowlist: 'text',
      preview_inbound_token_hash: 'char(64)',
      preview_sender_allowlist: 'text',
      preview_sheet_name: 'text',
      separation_window_hours: 'smallint',
      weight_tolerance_percent: 'numeric(5, 2)',
    })
  })

  test('as faixas e a coerência da prévia são do banco, não só da tela', () => {
    expect(unqualifiedCheckSqlByName(contractorReceivingProfiles)).toEqual({
      [`${TABLE}_arrival_reference_label_check`]:
        'char_length("arrival_reference_label") between 1 and 60 and "arrival_reference_label" !~ \'[[:cntrl:]]\'',
      [`${TABLE}_arrival_reference_pattern_check`]:
        'char_length("arrival_reference_pattern") between 1 and 200',
      [`${TABLE}_delivery_deadline_business_days_check`]:
        '"delivery_deadline_business_days" between 1 and 60',
      [`${TABLE}_match_window_days_check`]: '"match_window_days" between 1 and 60',
      [`${TABLE}_preview_column_map_check`]: 'jsonb_typeof("preview_column_map") = \'object\'',
      [`${TABLE}_preview_forwarder_allowlist_check`]: PREVIEW_ALLOWLIST_CHECK(
        'preview_forwarder_allowlist',
      ),
      [`${TABLE}_preview_inbound_allowlists_check`]:
        '"preview_inbound_token_hash" is null or ("preview_forwarder_allowlist" is not null and "preview_sender_allowlist" is not null)',
      [`${TABLE}_preview_inbound_token_hash_check`]:
        '"preview_inbound_token_hash" ~ \'^[0-9a-f]{64}$\'',
      [`${TABLE}_preview_requires_column_map_check`]:
        'not "preview_enabled" or "preview_column_map" is not null',
      [`${TABLE}_preview_sender_allowlist_check`]: PREVIEW_ALLOWLIST_CHECK(
        'preview_sender_allowlist',
      ),
      [`${TABLE}_preview_sheet_name_check`]: 'char_length("preview_sheet_name") between 1 and 31',
      [`${TABLE}_separation_window_hours_check`]: '"separation_window_hours" between 1 and 168',
      [`${TABLE}_weight_tolerance_percent_check`]: '"weight_tolerance_percent" between 0 and 100',
    })
  })
})
