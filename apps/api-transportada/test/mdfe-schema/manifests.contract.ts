/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { mdfeManifests } from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  columnNames,
  columnSqlTypes,
  expectGeneratedUuidPrimaryKey,
  expectRequiredUtcTimestamps,
  indexColumnsByName,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

describe('mdfe manifest schema', () => {
  test('carries the manifest header the MDF-e 3.00 layout demands', () => {
    expect(getTableConfig(mdfeManifests).name).toBe('mdfe_manifests')
    expectGeneratedUuidPrimaryKey(mdfeManifests)
    expectRequiredUtcTimestamps(mdfeManifests)

    expect(columnNames(mdfeManifests)).toEqual([
      'id',
      'company_id',
      'vehicle_id',
      'status',
      'fiscal_environment',
      'emitter_type',
      'transporter_type',
      'origin_state',
      'destination_state',
      'cargo_type',
      'cargo_product',
      'cargo_product_ncm',
      'cargo_unit',
      'cte_count',
      'cargo_value',
      'cargo_weight',
      'rntrc',
      'contractor_tax_id',
      'contractor_name',
      'freight_value',
      'loading_postal_code',
      'discharge_postal_code',
      'insurance_endorsement',
      'fiscal_series',
      'fiscal_number',
      'trip_started_at',
      'additional_information',
      'version',
      'created_at',
      'updated_at',
    ])
  })

  // vCarga é TDec_1302 e qCarga é TDec_1104 — float binário aqui vira rejeição de totais
  test('freezes the cargo totals in decimal, never in binary float', () => {
    expect(columnSqlTypes(mdfeManifests)).toMatchObject({
      cargo_value: 'numeric(15, 2)',
      cargo_weight: 'numeric(15, 4)',
      cte_count: 'bigint',
      freight_value: 'numeric(15, 2)',
      fiscal_number: 'bigint',
      version: 'bigint',
    })
  })

  test('constrains the SEFAZ enumerations of the manifest header', () => {
    const checks = checkSqlByName(mdfeManifests)

    expect(checks).toMatchObject({
      mdfe_manifests_cargo_unit_check: expect.stringContaining("in ('01', '02')"),
      mdfe_manifests_emitter_type_check: expect.stringContaining("in ('1', '2', '3')"),
      mdfe_manifests_environment_check: expect.stringContaining(
        "in ('homologation', 'production')",
      ),
      mdfe_manifests_status_check: expect.stringContaining(
        "in ('draft', 'issuing', 'authorized', 'rejected', 'closed', 'cancelled', 'discarded')",
      ),
    })
    expect(checks.mdfe_manifests_cargo_type_check).toContain(
      "in ('01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12')",
    )
    expect(checks.mdfe_manifests_transporter_type_check).toContain("in ('1', '2', '3')")
  })

  test('keeps the optional fiscal strings either empty or well formed', () => {
    const checks = checkSqlByName(mdfeManifests)

    expect(checks.mdfe_manifests_state_check).toContain("~ '^[A-Z]{2}$'")
    expect(checks.mdfe_manifests_rntrc_check).toContain("~ '^[0-9]{8}$'")
    expect(checks.mdfe_manifests_cargo_product_ncm_check).toContain("~ '^[0-9]{8}$'")
  })

  test('refuses negative totals and a non-positive fiscal number', () => {
    const checks = checkSqlByName(mdfeManifests)

    expect(checks.mdfe_manifests_totals_check).toContain('>= 0')
    expect(checks.mdfe_manifests_fiscal_number_check).toContain('> 0')
    expect(checks.mdfe_manifests_version_check).toContain('> 0')
  })

  // Um manifesto autorizado sem série/número não tem como ser encerrado nem cancelado depois
  test('demands the fiscal series and number once the manifest leaves the draft', () => {
    const check = checkSqlByName(mdfeManifests).mdfe_manifests_issued_state_check

    expect(check).toContain("'authorized'")
    expect(check).toContain("'closed'")
    expect(check).toContain("'cancelled'")
    expect(check).toContain('is not null')
  })

  test('scopes the manifest number to the tenant, the environment and the series', () => {
    expect(uniqueColumnsByName(mdfeManifests)).toMatchObject({
      mdfe_manifests_company_id_id_unique: ['company_id', 'id'],
    })
    expect(indexColumnsByName(mdfeManifests)).toMatchObject({
      mdfe_manifests_company_environment_series_number_unique: [
        'company_id',
        'fiscal_environment',
        'fiscal_series',
        'fiscal_number',
      ],
      mdfe_manifests_company_status_created_at_idx: ['company_id', 'status', 'created_at'],
    })
  })
})
