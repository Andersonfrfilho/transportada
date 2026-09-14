/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { CARGO_LAYOUT_STATUSES, tripCargoLayouts } from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  columnNames,
  columnSqlTypes,
  expectGeneratedUuidPrimaryKey,
  expectRequiredUtcTimestamps,
  foreignKeys,
  indexColumnsByName,
  requiredColumnNames,
  unqualifiedCheckSqlByName,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

describe('trip cargo layouts (spec 145 D5)', () => {
  test('is its own table with a generated uuid key and utc timestamps', () => {
    expectGeneratedUuidPrimaryKey(tripCargoLayouts)
    expectRequiredUtcTimestamps(tripCargoLayouts)
  })

  /** D6: a chave que decide se a planta guardada ainda vale viaja com a versão da política. */
  test('requires the hash, the policy version and the canonical input', () => {
    const required = requiredColumnNames(tripCargoLayouts)

    expect(required).toContain('input_hash')
    expect(required).toContain('policy_version')
    expect(required).toContain('input')
    expect(columnSqlTypes(tripCargoLayouts).input).toBe('jsonb')
    expect(columnSqlTypes(tripCargoLayouts).layout).toBe('jsonb')
  })

  test('closes the status on the lifecycle, without a native enum', () => {
    expect(CARGO_LAYOUT_STATUSES).toEqual(['queued', 'running', 'ready', 'failed'])
    expect(columnSqlTypes(tripCargoLayouts).status).toBe('text')

    const checks = checkSqlByName(tripCargoLayouts)
    for (const status of CARGO_LAYOUT_STATUSES) {
      expect(checks.trip_cargo_layouts_status_check).toContain(`'${status}'`)
    }
  })

  /** Planta pronta tem desenho; desenho guardado é planta pronta. */
  test('pairs a ready status with a layout, in both directions', () => {
    expect(unqualifiedCheckSqlByName(tripCargoLayouts).trip_cargo_layouts_layout_check).toContain(
      `("status" = 'ready') = ("layout" is not null)`,
    )
  })

  /** Falha tem causa nomeada; sucesso não carrega código de erro pendurado. */
  test('pairs failure with a reason, and success with none', () => {
    expect(
      unqualifiedCheckSqlByName(tripCargoLayouts).trip_cargo_layouts_error_code_check,
    ).toContain(`("status" = 'failed') = (length("error_code") > 0)`)
  })

  test('keeps the attempt and duration counters non-negative', () => {
    expect(unqualifiedCheckSqlByName(tripCargoLayouts).trip_cargo_layouts_counters_check).toContain(
      `"attempt" >= 0 and ("duration_ms" is null or "duration_ms" >= 0)`,
    )
  })

  /** D6: mesma entrada na mesma empresa é a mesma planta — o segundo pedido acha a primeira. */
  test('makes the input hash unique per company', () => {
    expect(uniqueColumnsByName(tripCargoLayouts)).toEqual({
      trip_cargo_layouts_company_id_id_unique: ['company_id', 'id'],
      trip_cargo_layouts_company_input_hash_unique: ['company_id', 'input_hash'],
    })
  })

  /** D3: a prévia da montagem pede planta de uma viagem que ainda não existe. */
  test('allows a layout with no trip yet, which is what the preview is', () => {
    expect(requiredColumnNames(tripCargoLayouts)).not.toContain('trip_id')
    expect(columnNames(tripCargoLayouts)).toContain('trip_id')
  })

  test('reaches the trip through the tenant, never by id alone', () => {
    expect(foreignKeys(tripCargoLayouts)).toContainEqual({
      columns: ['company_id', 'trip_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'trips',
      name: 'trip_cargo_layouts_company_trip_fk',
      onDelete: 'cascade',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(tripCargoLayouts)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'trip_cargo_layouts_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  /** D10: a leitura da viagem procura a planta por (empresa, viagem), e o índice é o que a paga. */
  test('indexes the tenant and trip pair the read path filters by', () => {
    expect(indexColumnsByName(tripCargoLayouts)).toEqual({
      trip_cargo_layouts_company_trip_idx: ['company_id', 'trip_id'],
    })
  })
})
