/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  mdfeManifestDrivers,
  mdfeManifestItems,
  mdfeManifestLoadingCities,
} from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  columnNames,
  columnSqlTypes,
  expectGeneratedUuidPrimaryKey,
  indexColumnsByName,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

describe('mdfe manifest item schema', () => {
  test('freezes the discharge city and the cargo share taken from the CT-e', () => {
    expect(getTableConfig(mdfeManifestItems).name).toBe('mdfe_manifest_items')
    expectGeneratedUuidPrimaryKey(mdfeManifestItems)

    expect(columnNames(mdfeManifestItems)).toEqual([
      'id',
      'company_id',
      'manifest_id',
      'cte_fiscal_document_id',
      'access_key',
      'discharge_city_code',
      'discharge_city_name',
      'cargo_value',
      'cargo_weight',
      'released_at',
      'created_at',
    ])
    expect(columnSqlTypes(mdfeManifestItems)).toMatchObject({
      cargo_value: 'numeric(15, 2)',
      cargo_weight: 'numeric(15, 4)',
    })
  })

  test('validates the access key and the IBGE city code of the item', () => {
    const checks = checkSqlByName(mdfeManifestItems)

    expect(checks.mdfe_manifest_items_access_key_check).toContain("~ '^[0-9]{44}$'")
    expect(checks.mdfe_manifest_items_discharge_city_code_check).toContain("~ '^[0-9]{7}$'")
    expect(checks.mdfe_manifest_items_discharge_city_name_check).toContain('length(')
    expect(checks.mdfe_manifest_items_totals_check).toContain('>= 0')
  })

  // O mesmo CT-e em dois manifestos vivos é rejeição na SEFAZ; cancelar o manifesto libera o CT-e
  test('holds one CT-e in a single live manifest and releases it when the manifest dies', () => {
    expect(uniqueColumnsByName(mdfeManifestItems)).toMatchObject({
      mdfe_manifest_items_company_id_id_unique: ['company_id', 'id'],
      mdfe_manifest_items_company_manifest_document_unique: [
        'company_id',
        'manifest_id',
        'cte_fiscal_document_id',
      ],
    })

    const indexes = indexColumnsByName(mdfeManifestItems)
    expect(indexes.mdfe_manifest_items_live_document_unique).toEqual([
      'company_id',
      'cte_fiscal_document_id',
    ])

    const liveIndex = getTableConfig(mdfeManifestItems).indexes.find(
      (tableIndex) => tableIndex.config.name === 'mdfe_manifest_items_live_document_unique',
    )
    expect(liveIndex?.config.unique).toBeTrue()
    expect(liveIndex?.config.where).toBeDefined()
  })
})

describe('mdfe manifest driver schema', () => {
  test('snapshots the driver name and tax id at manifest time', () => {
    expect(getTableConfig(mdfeManifestDrivers).name).toBe('mdfe_manifest_drivers')
    expectGeneratedUuidPrimaryKey(mdfeManifestDrivers)

    expect(columnNames(mdfeManifestDrivers)).toEqual([
      'id',
      'company_id',
      'manifest_id',
      'driver_id',
      'driver_name',
      'driver_tax_id',
      'position',
      'created_at',
    ])
  })

  test('keeps the crew inside the layout bounds of one to ten drivers', () => {
    const checks = checkSqlByName(mdfeManifestDrivers)

    expect(checks.mdfe_manifest_drivers_position_check).toContain('between 1 and 10')
    expect(checks.mdfe_manifest_drivers_tax_id_check).toContain("~ '^[0-9]{11}$'")
    expect(checks.mdfe_manifest_drivers_name_check).toContain('length(')
  })

  test('refuses the same driver or the same seat twice in one manifest', () => {
    expect(uniqueColumnsByName(mdfeManifestDrivers)).toMatchObject({
      mdfe_manifest_drivers_company_id_id_unique: ['company_id', 'id'],
      mdfe_manifest_drivers_company_manifest_driver_unique: [
        'company_id',
        'manifest_id',
        'driver_id',
      ],
      mdfe_manifest_drivers_company_manifest_position_unique: [
        'company_id',
        'manifest_id',
        'position',
      ],
    })
  })
})

describe('mdfe manifest loading city schema', () => {
  test('stores the loading cities the manifest declares', () => {
    expect(getTableConfig(mdfeManifestLoadingCities).name).toBe('mdfe_manifest_loading_cities')
    expectGeneratedUuidPrimaryKey(mdfeManifestLoadingCities)

    expect(columnNames(mdfeManifestLoadingCities)).toEqual([
      'id',
      'company_id',
      'manifest_id',
      'city_code',
      'city_name',
      'position',
      'created_at',
    ])
  })

  test('caps the loading cities at the fifty the layout accepts', () => {
    const checks = checkSqlByName(mdfeManifestLoadingCities)

    expect(checks.mdfe_manifest_loading_cities_position_check).toContain('between 1 and 50')
    expect(checks.mdfe_manifest_loading_cities_city_code_check).toContain("~ '^[0-9]{7}$'")
    expect(checks.mdfe_manifest_loading_cities_city_name_check).toContain('length(')
  })

  test('refuses the same city or the same slot twice in one manifest', () => {
    expect(uniqueColumnsByName(mdfeManifestLoadingCities)).toMatchObject({
      mdfe_manifest_loading_cities_company_id_id_unique: ['company_id', 'id'],
      mdfe_manifest_loading_cities_company_manifest_city_unique: [
        'company_id',
        'manifest_id',
        'city_code',
      ],
      mdfe_manifest_loading_cities_company_manifest_position_unique: [
        'company_id',
        'manifest_id',
        'position',
      ],
    })
  })
})
