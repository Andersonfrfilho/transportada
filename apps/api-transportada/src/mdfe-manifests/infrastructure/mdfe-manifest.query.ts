/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, inArray, isNull, lt, or, type SQL } from 'drizzle-orm'

import { companyFiscalProfiles } from '../../database/company-fiscal-profile.schema.js'
import { cteFiscalDocuments } from '../../database/cte-issuance.schema.js'
import { fleetDrivers, fleetVehicles } from '../../database/fleet.schema.js'
import {
  mdfeManifestDrivers,
  mdfeManifestItems,
  mdfeManifestLoadingCities,
  mdfeManifests,
} from '../../database/mdfe.schema.js'
import type { KeysetCursor } from '../../shared/keyset-cursor.support.js'
import type { MdfeManifestFilters } from '../application/mdfe-manifest.port.js'

type CompanyScope = { readonly companyId: string }
type ManifestScope = CompanyScope & { readonly manifestId: string }
type DocumentScope = CompanyScope & { readonly fiscalDocumentIds: readonly string[] }

type ManifestListScope = CompanyScope & {
  readonly cursor: KeysetCursor | null
  readonly filters?: MdfeManifestFilters
}

export function buildManifestListFilters({
  companyId,
  cursor,
  filters,
}: ManifestListScope): readonly SQL[] {
  const conditions: SQL[] = [eq(mdfeManifests.companyId, companyId)]
  if (cursor !== null) conditions.push(buildCursorCondition(cursor))
  if (filters?.statusEq !== undefined) {
    conditions.push(eq(mdfeManifests.status, filters.statusEq))
  }
  if (filters?.vehicleIdEq !== undefined) {
    conditions.push(eq(mdfeManifests.vehicleId, filters.vehicleIdEq))
  }
  return conditions
}

export function buildManifestFilters({ companyId, manifestId }: ManifestScope): readonly SQL[] {
  return [eq(mdfeManifests.companyId, companyId), eq(mdfeManifests.id, manifestId)]
}

export function buildManifestItemFilters({ companyId, manifestId }: ManifestScope): readonly SQL[] {
  return [eq(mdfeManifestItems.companyId, companyId), eq(mdfeManifestItems.manifestId, manifestId)]
}

export function buildManifestDriverFilters({
  companyId,
  manifestId,
}: ManifestScope): readonly SQL[] {
  return [
    eq(mdfeManifestDrivers.companyId, companyId),
    eq(mdfeManifestDrivers.manifestId, manifestId),
  ]
}

export function buildManifestLoadingCityFilters({
  companyId,
  manifestId,
}: ManifestScope): readonly SQL[] {
  return [
    eq(mdfeManifestLoadingCities.companyId, companyId),
    eq(mdfeManifestLoadingCities.manifestId, manifestId),
  ]
}

export function buildCandidateDocumentFilters({
  companyId,
  fiscalDocumentIds,
}: DocumentScope): readonly SQL[] {
  return [
    eq(cteFiscalDocuments.companyId, companyId),
    inArray(cteFiscalDocuments.id, [...fiscalDocumentIds]),
  ]
}

/** Um CT-e já preso a um manifesto vivo não pode entrar em outro — a linha liberada não conta. */
export function buildLiveManifestFilters({
  companyId,
  fiscalDocumentIds,
}: DocumentScope): readonly SQL[] {
  return [
    eq(mdfeManifestItems.companyId, companyId),
    inArray(mdfeManifestItems.cteFiscalDocumentId, [...fiscalDocumentIds]),
    isNull(mdfeManifestItems.releasedAt),
  ]
}

export function buildFleetVehicleFilters({
  companyId,
  vehicleId,
}: CompanyScope & { readonly vehicleId: string }): readonly SQL[] {
  return [eq(fleetVehicles.companyId, companyId), eq(fleetVehicles.id, vehicleId)]
}

export function buildFleetDriverFilters({
  companyId,
  driverIds,
}: CompanyScope & { readonly driverIds: readonly string[] }): readonly SQL[] {
  return [eq(fleetDrivers.companyId, companyId), inArray(fleetDrivers.id, [...driverIds])]
}

export function buildFiscalProfileFilters({ companyId }: CompanyScope): readonly SQL[] {
  return [eq(companyFiscalProfiles.companyId, companyId)]
}

function buildCursorCondition(cursor: KeysetCursor): SQL {
  return or(
    lt(mdfeManifests.createdAt, cursor.createdAt),
    and(eq(mdfeManifests.createdAt, cursor.createdAt), lt(mdfeManifests.id, cursor.id)),
  ) as SQL
}
