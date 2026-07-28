/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  buildCandidateDocumentFilters,
  buildFiscalProfileFilters,
  buildFleetDriverFilters,
  buildFleetVehicleFilters,
  buildLiveManifestFilters,
  buildManifestDriverFilters,
  buildManifestFilters,
  buildManifestItemFilters,
  buildManifestListFilters,
  buildManifestLoadingCityFilters,
} from '../../src/mdfe-manifests/infrastructure/mdfe-manifest.query.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000a1'
const MANIFEST_ID = '00000000-0000-4000-8000-0000000000a2'
const VEHICLE_ID = '00000000-0000-4000-8000-0000000000a3'
const DRIVER_ID = '00000000-0000-4000-8000-0000000000a4'
const DOCUMENT_ID = '00000000-0000-4000-8000-0000000000a5'

const dialect = new PgDialect()

const toSql = (filters: readonly Parameters<typeof and>[number][]) =>
  dialect.sqlToQuery(and(...filters)!)

describe('MDF-e manifest query tenant safety', () => {
  test('scopes the manifest listing by company', () => {
    const query = toSql(buildManifestListFilters({ companyId: COMPANY_ID, cursor: null }))

    expect(query.sql).toContain('"mdfe_manifests"."company_id" = $')
    expect(query.params).toEqual([COMPANY_ID])
  })

  test('keeps the company filter alongside cursor and filters', () => {
    const query = toSql(
      buildManifestListFilters({
        companyId: COMPANY_ID,
        cursor: { createdAt: new Date('2026-07-28T10:00:00.000Z'), id: MANIFEST_ID },
        filters: { statusEq: 'draft', vehicleIdEq: VEHICLE_ID },
      }),
    )

    expect(query.sql).toContain('"mdfe_manifests"."company_id" = $')
    expect(query.sql).toContain('"mdfe_manifests"."created_at" < $')
    expect(query.sql).toContain('"mdfe_manifests"."status" = $')
    expect(query.sql).toContain('"mdfe_manifests"."vehicle_id" = $')
    expect(query.params).toEqual([
      COMPANY_ID,
      '2026-07-28T10:00:00.000Z',
      '2026-07-28T10:00:00.000Z',
      MANIFEST_ID,
      'draft',
      VEHICLE_ID,
    ])
  })

  test('scopes a single manifest lookup by company and identifier', () => {
    const query = toSql(buildManifestFilters({ companyId: COMPANY_ID, manifestId: MANIFEST_ID }))

    expect(query.sql).toContain('"mdfe_manifests"."company_id" = $')
    expect(query.sql).toContain('"mdfe_manifests"."id" = $')
    expect(query.params).toEqual([COMPANY_ID, MANIFEST_ID])
  })

  test('scopes the manifest items by company and manifest', () => {
    const query = toSql(
      buildManifestItemFilters({ companyId: COMPANY_ID, manifestId: MANIFEST_ID }),
    )

    expect(query.sql).toContain('"mdfe_manifest_items"."company_id" = $')
    expect(query.sql).toContain('"mdfe_manifest_items"."manifest_id" = $')
    expect(query.params).toEqual([COMPANY_ID, MANIFEST_ID])
  })

  test('scopes the manifest drivers by company and manifest', () => {
    const query = toSql(
      buildManifestDriverFilters({ companyId: COMPANY_ID, manifestId: MANIFEST_ID }),
    )

    expect(query.sql).toContain('"mdfe_manifest_drivers"."company_id" = $')
    expect(query.sql).toContain('"mdfe_manifest_drivers"."manifest_id" = $')
    expect(query.params).toEqual([COMPANY_ID, MANIFEST_ID])
  })

  test('scopes the loading cities by company and manifest', () => {
    const query = toSql(
      buildManifestLoadingCityFilters({ companyId: COMPANY_ID, manifestId: MANIFEST_ID }),
    )

    expect(query.sql).toContain('"mdfe_manifest_loading_cities"."company_id" = $')
    expect(query.sql).toContain('"mdfe_manifest_loading_cities"."manifest_id" = $')
    expect(query.params).toEqual([COMPANY_ID, MANIFEST_ID])
  })

  test('scopes the candidate CT-e lookup by company', () => {
    const query = toSql(
      buildCandidateDocumentFilters({ companyId: COMPANY_ID, fiscalDocumentIds: [DOCUMENT_ID] }),
    )

    expect(query.sql).toContain('"cte_fiscal_documents"."company_id" = $')
    expect(query.sql).toContain('"cte_fiscal_documents"."id" in ($')
    expect(query.params).toEqual([COMPANY_ID, DOCUMENT_ID])
  })

  test('scopes the live manifest lookup by company and ignores released items', () => {
    const query = toSql(
      buildLiveManifestFilters({ companyId: COMPANY_ID, fiscalDocumentIds: [DOCUMENT_ID] }),
    )

    expect(query.sql).toContain('"mdfe_manifest_items"."company_id" = $')
    expect(query.sql).toContain('"mdfe_manifest_items"."cte_fiscal_document_id" in ($')
    expect(query.sql).toContain('"mdfe_manifest_items"."released_at" is null')
    expect(query.params).toEqual([COMPANY_ID, DOCUMENT_ID])
  })

  test('scopes the vehicle lookup by company', () => {
    const query = toSql(buildFleetVehicleFilters({ companyId: COMPANY_ID, vehicleId: VEHICLE_ID }))

    expect(query.sql).toContain('"fleet_vehicles"."company_id" = $')
    expect(query.sql).toContain('"fleet_vehicles"."id" = $')
    expect(query.params).toEqual([COMPANY_ID, VEHICLE_ID])
  })

  test('scopes the driver lookup by company', () => {
    const query = toSql(buildFleetDriverFilters({ companyId: COMPANY_ID, driverIds: [DRIVER_ID] }))

    expect(query.sql).toContain('"fleet_drivers"."company_id" = $')
    expect(query.sql).toContain('"fleet_drivers"."id" in ($')
    expect(query.params).toEqual([COMPANY_ID, DRIVER_ID])
  })

  test('scopes the fiscal profile lookup by company', () => {
    const query = toSql(buildFiscalProfileFilters({ companyId: COMPANY_ID }))

    expect(query.sql).toContain('"company_fiscal_profiles"."company_id" = $')
    expect(query.params).toEqual([COMPANY_ID])
  })
})
