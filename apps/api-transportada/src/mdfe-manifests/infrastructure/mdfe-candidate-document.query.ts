/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, inArray, sum } from 'drizzle-orm'

import { cteBatchItemDocuments, cteBatchItems } from '../../database/cte-batch.schema.js'
import { cteFiscalDocuments } from '../../database/cte-issuance.schema.js'
import { mdfeManifestItems } from '../../database/mdfe.schema.js'
import {
  nfeAddresses,
  nfeDocuments,
  nfeParticipants,
  nfeVolumes,
} from '../../database/nfe.schema.js'
import { formatScaledDecimal } from '../../shared/decimal.service.js'
import type { MdfeCandidateDocument } from '../domain/mdfe-manifest-eligibility.policy.js'
import {
  CARGO_WEIGHT_SCALE,
  sumCargoValue,
  sumScaled,
} from '../domain/mdfe-manifest-grouping.policy.js'
import { buildCandidateDocumentFilters, buildLiveManifestFilters } from './mdfe-manifest.query.js'
import {
  resolveManifestCities,
  type CityLocation,
  type ManifestCities,
} from '../domain/manifest-cities.policy.js'
import type { MdfeQueryable } from './mdfe-queryable.type.js'

type CandidateScope = {
  readonly companyId: string
  readonly fiscalDocumentIds: readonly string[]
}

type DocumentTotals = {
  readonly value: string
  readonly weight: string
}

const CANCELLED_STATUS = 'cancelled'
const EMPTY_CITY: CityLocation = { cityCode: null, cityName: null, state: null }

export async function loadCandidateDocuments(
  queryable: MdfeQueryable,
  scope: CandidateScope,
): Promise<readonly MdfeCandidateDocument[]> {
  if (scope.fiscalDocumentIds.length === 0) return []

  const records = await queryable
    .select({
      accessKey: cteFiscalDocuments.accessKey,
      batchItemId: cteFiscalDocuments.batchItemId,
      cancellationRequestedAt: cteFiscalDocuments.cancellationRequestedAt,
      companyId: cteFiscalDocuments.companyId,
      fiscalDocumentId: cteFiscalDocuments.id,
      fiscalEnvironment: cteFiscalDocuments.fiscalEnvironment,
      referenceDocumentId: cteBatchItems.nfeDocumentId,
      status: cteFiscalDocuments.status,
    })
    .from(cteFiscalDocuments)
    .innerJoin(
      cteBatchItems,
      and(
        eq(cteBatchItems.companyId, cteFiscalDocuments.companyId),
        eq(cteBatchItems.id, cteFiscalDocuments.batchItemId),
      ),
    )
    .where(and(...buildCandidateDocumentFilters(scope)))

  if (records.length === 0) return []

  const [links, liveManifests] = await Promise.all([
    loadItemDocuments(
      queryable,
      scope.companyId,
      records.map((record) => record.batchItemId),
    ),
    loadLiveManifests(queryable, scope),
  ])

  const coveredDocuments = records.map(
    (record) => links.get(record.batchItemId) ?? [record.referenceDocumentId],
  )
  const [cities, totals] = await Promise.all([
    loadCities(
      queryable,
      scope.companyId,
      records.map((record) => record.referenceDocumentId),
    ),
    loadDocumentTotals(queryable, scope.companyId, [...new Set(coveredDocuments.flat())]),
  ])

  return records.map((record, index) => {
    const covered = coveredDocuments[index] ?? []
    const origin = cities.get(record.referenceDocumentId)?.origin ?? EMPTY_CITY
    const discharge = cities.get(record.referenceDocumentId)?.discharge ?? EMPTY_CITY

    return {
      accessKey: record.accessKey,
      companyId: record.companyId,
      dischargeCityCode: discharge.cityCode,
      dischargeCityName: discharge.cityName,
      dischargeState: discharge.state,
      fiscalDocumentId: record.fiscalDocumentId,
      fiscalEnvironment: record.fiscalEnvironment,
      liveManifestId: liveManifests.get(record.fiscalDocumentId) ?? null,
      originCityCode: origin.cityCode,
      originCityName: origin.cityName,
      originState: origin.state,
      status: record.cancellationRequestedAt === null ? record.status : CANCELLED_STATUS,
      ...accumulate(covered, totals),
    }
  })
}

function accumulate(
  documentIds: readonly string[],
  totals: Map<string, DocumentTotals>,
): { readonly cargoValue: string; readonly cargoWeight: string } {
  const covered = documentIds.flatMap((documentId) => totals.get(documentId) ?? [])

  return {
    cargoValue: sumCargoValue(covered.map((total) => total.value)),
    cargoWeight: formatScaledDecimal(
      sumScaled(
        covered.map((total) => total.weight),
        CARGO_WEIGHT_SCALE,
      ),
      CARGO_WEIGHT_SCALE,
    ),
  }
}

async function loadItemDocuments(
  queryable: MdfeQueryable,
  companyId: string,
  itemIds: readonly string[],
): Promise<Map<string, readonly string[]>> {
  const rows = await queryable
    .select({
      documentId: cteBatchItemDocuments.nfeDocumentId,
      itemId: cteBatchItemDocuments.itemId,
    })
    .from(cteBatchItemDocuments)
    .where(
      and(
        eq(cteBatchItemDocuments.companyId, companyId),
        inArray(cteBatchItemDocuments.itemId, [...new Set(itemIds)]),
      ),
    )

  const documents = new Map<string, string[]>()
  for (const row of rows) {
    const current = documents.get(row.itemId)
    if (current === undefined) documents.set(row.itemId, [row.documentId])
    else current.push(row.documentId)
  }

  return documents
}

async function loadLiveManifests(
  queryable: MdfeQueryable,
  scope: CandidateScope,
): Promise<Map<string, string>> {
  const rows = await queryable
    .select({
      fiscalDocumentId: mdfeManifestItems.cteFiscalDocumentId,
      manifestId: mdfeManifestItems.manifestId,
    })
    .from(mdfeManifestItems)
    .where(and(...buildLiveManifestFilters(scope)))

  return new Map(rows.map((row) => [row.fiscalDocumentId, row.manifestId]))
}

async function loadDocumentTotals(
  queryable: MdfeQueryable,
  companyId: string,
  documentIds: readonly string[],
): Promise<Map<string, DocumentTotals>> {
  if (documentIds.length === 0) return new Map()
  const [values, weights] = await Promise.all([
    queryable
      .select({ documentId: nfeDocuments.id, totalValue: nfeDocuments.totalValue })
      .from(nfeDocuments)
      .where(
        and(eq(nfeDocuments.companyId, companyId), inArray(nfeDocuments.id, [...documentIds])),
      ),
    queryable
      .select({ documentId: nfeVolumes.documentId, grossWeight: sum(nfeVolumes.grossWeight) })
      .from(nfeVolumes)
      .where(
        and(eq(nfeVolumes.companyId, companyId), inArray(nfeVolumes.documentId, [...documentIds])),
      )
      .groupBy(nfeVolumes.documentId),
  ])

  const grossWeights = new Map(weights.map((row) => [row.documentId, row.grossWeight]))

  return new Map(
    values.map((row) => [
      row.documentId,
      { value: row.totalValue, weight: grossWeights.get(row.documentId) ?? '0' },
    ]),
  )
}

async function loadCities(
  queryable: MdfeQueryable,
  companyId: string,
  documentIds: readonly string[],
): Promise<Map<string, ManifestCities>> {
  const rows = await queryable
    .select({
      city: nfeAddresses.city,
      cityCode: nfeAddresses.cityCode,
      documentId: nfeParticipants.documentId,
      // CEP e número entram porque a escolha entre `<entrega>` e `<enderDest>` usa o mesmo
      // critério de endereço utilizável que a parada da viagem (spec 073 RF2).
      number: nfeAddresses.number,
      postalCode: nfeAddresses.postalCode,
      role: nfeParticipants.role,
      state: nfeAddresses.state,
    })
    .from(nfeParticipants)
    .leftJoin(
      nfeAddresses,
      and(
        eq(nfeAddresses.companyId, nfeParticipants.companyId),
        eq(nfeAddresses.participantId, nfeParticipants.id),
      ),
    )
    .where(
      and(
        eq(nfeParticipants.companyId, companyId),
        inArray(nfeParticipants.documentId, [...new Set(documentIds)]),
      ),
    )

  return resolveManifestCities(rows)
}
