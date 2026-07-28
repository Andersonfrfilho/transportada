/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MdfeFiscalEnvironment } from '../../database/mdfe.schema.js'

export const MDFE_BLOCK_REASON = {
  alreadyManifested: 'MDFE_DOCUMENT_ALREADY_MANIFESTED',
  duplicated: 'MDFE_DOCUMENT_DUPLICATED',
  environmentMismatch: 'MDFE_DOCUMENT_ENVIRONMENT_MISMATCH',
  missingDischargeCity: 'MDFE_DOCUMENT_MISSING_DISCHARGE_CITY',
  missingLoadingCity: 'MDFE_DOCUMENT_MISSING_LOADING_CITY',
  missingTotals: 'MDFE_DOCUMENT_MISSING_TOTALS',
  notAuthorized: 'MDFE_DOCUMENT_NOT_AUTHORIZED',
  notFound: 'MDFE_DOCUMENT_NOT_FOUND',
  otherCompany: 'MDFE_DOCUMENT_OTHER_COMPANY',
} as const

export type MdfeBlockReason = (typeof MDFE_BLOCK_REASON)[keyof typeof MDFE_BLOCK_REASON]

export type MdfeCandidateDocument = {
  readonly accessKey: string
  readonly cargoValue: string
  readonly cargoWeight: string
  readonly companyId: string
  readonly dischargeCityCode: string | null
  readonly dischargeCityName: string | null
  readonly dischargeState: string | null
  readonly fiscalDocumentId: string
  readonly fiscalEnvironment: string
  readonly liveManifestId: string | null
  readonly originCityCode: string | null
  readonly originCityName: string | null
  readonly originState: string | null
  readonly status: string
}

export type ManifestableDocument = {
  readonly accessKey: string
  readonly cargoValue: string
  readonly cargoWeight: string
  readonly dischargeCityCode: string
  readonly dischargeCityName: string
  readonly dischargeState: string
  readonly fiscalDocumentId: string
  readonly originCityCode: string
  readonly originCityName: string
  readonly originState: string
}

export type MdfeDocumentBlock = {
  readonly fiscalDocumentId: string
  readonly reason: MdfeBlockReason
}

export type MdfeManifestSelection = {
  readonly blocked: readonly MdfeDocumentBlock[]
  readonly manifestable: readonly ManifestableDocument[]
}

export type SelectManifestableDocumentsParams = {
  readonly candidates: readonly MdfeCandidateDocument[]
  readonly companyId: string
  readonly fiscalEnvironment: MdfeFiscalEnvironment
  readonly requestedDocumentIds: readonly string[]
}

/** P3: only an authorized CT-e of the company, outside any live manifest, can be manifested. */
export function selectManifestableDocuments({
  candidates,
  companyId,
  fiscalEnvironment,
  requestedDocumentIds,
}: SelectManifestableDocumentsParams): MdfeManifestSelection {
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.fiscalDocumentId, candidate]),
  )
  const blocked: MdfeDocumentBlock[] = []
  const manifestable: ManifestableDocument[] = []
  const visited = new Set<string>()

  for (const fiscalDocumentId of requestedDocumentIds) {
    if (visited.has(fiscalDocumentId)) {
      blocked.push({ fiscalDocumentId, reason: MDFE_BLOCK_REASON.duplicated })
      continue
    }
    visited.add(fiscalDocumentId)

    const candidate = candidateById.get(fiscalDocumentId)
    if (candidate === undefined) {
      blocked.push({ fiscalDocumentId, reason: MDFE_BLOCK_REASON.notFound })
      continue
    }

    const reason = findBlockReason({ candidate, companyId, fiscalEnvironment })
    if (reason !== undefined) {
      blocked.push({ fiscalDocumentId, reason })
      continue
    }

    manifestable.push(toManifestableDocument(candidate))
  }

  return { blocked, manifestable }
}

type FindBlockReasonParams = {
  readonly candidate: MdfeCandidateDocument
  readonly companyId: string
  readonly fiscalEnvironment: MdfeFiscalEnvironment
}

function findBlockReason({
  candidate,
  companyId,
  fiscalEnvironment,
}: FindBlockReasonParams): MdfeBlockReason | undefined {
  if (candidate.companyId !== companyId) return MDFE_BLOCK_REASON.otherCompany
  if (candidate.status !== 'authorized') return MDFE_BLOCK_REASON.notAuthorized
  if (candidate.liveManifestId !== null) return MDFE_BLOCK_REASON.alreadyManifested
  if (candidate.fiscalEnvironment !== fiscalEnvironment) {
    return MDFE_BLOCK_REASON.environmentMismatch
  }
  if (
    !isFilled(candidate.dischargeCityCode) ||
    !isFilled(candidate.dischargeCityName) ||
    !isFilled(candidate.dischargeState)
  ) {
    return MDFE_BLOCK_REASON.missingDischargeCity
  }
  if (
    !isFilled(candidate.originCityCode) ||
    !isFilled(candidate.originCityName) ||
    !isFilled(candidate.originState)
  ) {
    return MDFE_BLOCK_REASON.missingLoadingCity
  }
  if (!isPositiveAmount(candidate.cargoValue) || !isPositiveAmount(candidate.cargoWeight)) {
    return MDFE_BLOCK_REASON.missingTotals
  }

  return undefined
}

function toManifestableDocument(candidate: MdfeCandidateDocument): ManifestableDocument {
  return {
    accessKey: candidate.accessKey,
    cargoValue: candidate.cargoValue,
    cargoWeight: candidate.cargoWeight,
    dischargeCityCode: (candidate.dischargeCityCode ?? '').trim(),
    dischargeCityName: (candidate.dischargeCityName ?? '').trim(),
    dischargeState: (candidate.dischargeState ?? '').trim(),
    fiscalDocumentId: candidate.fiscalDocumentId,
    originCityCode: (candidate.originCityCode ?? '').trim(),
    originCityName: (candidate.originCityName ?? '').trim(),
    originState: (candidate.originState ?? '').trim(),
  }
}

function isFilled(value: string | null): value is string {
  return value !== null && value.trim().length > 0
}

/** Persisted decimals are constrained to be non-negative, so any non-zero digit means positive. */
function isPositiveAmount(value: string): boolean {
  return /[1-9]/.test(value)
}
