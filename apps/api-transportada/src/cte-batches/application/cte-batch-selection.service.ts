/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CteEmissionProfileDetail } from '../../cte-profiles/application/cte-emission-profile.port.js'
import {
  type EmissionProfileCandidate,
  type EmissionProfileResolution,
  resolveEmissionProfile,
} from '../../cte-profiles/domain/emission-profile-resolution.policy.js'
import type { CteEmissionGroupingMode } from '../../database/cte-emission-profile.schema.js'
import { createFreightRuleSnapshot } from '../../freight-calculations/domain/freight-calculation-engine.service.js'
import { ApiError } from '../../shared/api.error.js'
import {
  CTE_BATCH_BLOCK_REASON,
  isFreightRuleInForce,
  resolveDocumentBlock,
} from '../domain/cte-batch-eligibility.policy.js'
import type {
  CteBatchProjectionCandidate,
  CteBatchProjectionProfile,
} from '../domain/cte-batch-projection.service.js'
import type {
  CteBatchPreviewBlock,
  CteBatchPreviewDocument,
  CteBatchPreviewLink,
  CteBatchPreviewNfseLink,
} from './cte-batch-preview.port.js'

/** Preview projects without persisting, so it has no versioned rule to reference. */
const UNVERSIONED_RULE = { id: '', version: '0' } as const

export type FreightRuleVersionReference = {
  readonly id: string
  readonly version: string
}

export type CteBatchSelectionParams = {
  readonly catalog: readonly CteEmissionProfileDetail[]
  readonly documentIds: readonly string[]
  readonly documents: readonly CteBatchPreviewDocument[]
  readonly emissionProfileId?: string | undefined
  readonly groupingMode?: CteEmissionGroupingMode | undefined
  readonly links: readonly CteBatchPreviewLink[]
  readonly nfseLinks: readonly CteBatchPreviewNfseLink[]
  readonly ruleVersions?: ReadonlyMap<string, FreightRuleVersionReference>
}

export type CteBatchSelectionResult = {
  readonly blocked: readonly CteBatchPreviewBlock[]
  readonly candidates: readonly CteBatchProjectionCandidate[]
}

type DocumentOutcome =
  | { readonly blocked?: undefined; readonly candidate: CteBatchProjectionCandidate }
  | { readonly blocked: CteBatchPreviewBlock; readonly candidate?: undefined }

export function splitDuplicatedDocumentIds(requested: readonly string[]): {
  readonly blocked: readonly CteBatchPreviewBlock[]
  readonly documentIds: readonly string[]
} {
  const seen = new Set<string>()
  const blocked: CteBatchPreviewBlock[] = []
  const documentIds: string[] = []

  for (const documentId of requested) {
    if (seen.has(documentId)) {
      blocked.push(blockDocument(documentId, CTE_BATCH_BLOCK_REASON.duplicated))
      continue
    }
    seen.add(documentId)
    documentIds.push(documentId)
  }

  return { blocked, documentIds }
}

export function selectCteBatchCandidates(params: CteBatchSelectionParams): CteBatchSelectionResult {
  const documentById = new Map(params.documents.map((document) => [document.id, document]))
  const batchIdByDocumentId = new Map(params.links.map((link) => [link.documentId, link.batchId]))
  const nfseInvoiceIdByDocumentId = new Map(
    params.nfseLinks.map((link) => [link.documentId, link.invoiceId]),
  )
  const manualResolution = resolveRequestedProfile(params.catalog, params.emissionProfileId)
  const blocked: CteBatchPreviewBlock[] = []
  const candidates: CteBatchProjectionCandidate[] = []

  for (const documentId of params.documentIds) {
    const document = documentById.get(documentId)
    if (document === undefined) {
      blocked.push(blockDocument(documentId, CTE_BATCH_BLOCK_REASON.notFound))
      continue
    }

    const outcome = resolveDocument({
      batchId: batchIdByDocumentId.get(documentId) ?? null,
      document,
      manualResolution,
      nfseInvoiceId: nfseInvoiceIdByDocumentId.get(documentId) ?? null,
      params,
    })
    if (outcome.blocked !== undefined) blocked.push(outcome.blocked)
    else candidates.push(outcome.candidate)
  }

  return { blocked, candidates }
}

function resolveDocument({
  batchId,
  document,
  manualResolution,
  nfseInvoiceId,
  params,
}: {
  readonly batchId: string | null
  readonly document: CteBatchPreviewDocument
  readonly manualResolution: EmissionProfileResolution | undefined
  readonly nfseInvoiceId: string | null
  readonly params: CteBatchSelectionParams
}): DocumentOutcome {
  const documentId = document.id
  const decision = resolveDocumentBlock({
    document,
    linkedBatchId: batchId,
    linkedNfseInvoiceId: nfseInvoiceId,
  })
  if (decision.blocked !== undefined) {
    return { blocked: { ...decision.blocked, documentId } }
  }

  const parties = decision.chargeable
  let resolution: EmissionProfileResolution
  try {
    resolution =
      manualResolution ??
      resolveEmissionProfile({ invoice: parties, profiles: params.catalog.map(toCandidate) })
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    return { blocked: blockDocument(documentId, error.code) }
  }

  const profile = params.catalog.find((candidate) => candidate.id === resolution.profileId)
  if (profile === undefined) throw new Error('CTE_BATCH_PROFILE_RESOLUTION_MISMATCH')
  const inForce = isFreightRuleInForce({
    referenceDate: document.issuedAt,
    validFrom: profile.freightRule.validFrom,
    validUntil: profile.freightRule.validUntil,
  })
  if (!inForce) return { blocked: blockDocument(documentId, CTE_BATCH_BLOCK_REASON.ruleNotInForce) }

  return {
    candidate: {
      document: {
        accessKey: document.accessKey,
        documentId,
        issuedAt: document.issuedAt,
        number: document.number,
        recipientTaxId: parties.recipientTaxId,
        senderTaxId: parties.senderTaxId,
        series: document.series,
        totalAmount: parties.totalAmount,
      },
      groupingMode: params.groupingMode ?? profile.groupingMode,
      profile: toProjectionProfile({
        profile,
        resolution,
        ruleVersion: params.ruleVersions?.get(profile.freightRuleId) ?? UNVERSIONED_RULE,
      }),
    },
  }
}

function resolveRequestedProfile(
  catalog: readonly CteEmissionProfileDetail[],
  requestedProfileId: string | undefined,
): EmissionProfileResolution | undefined {
  if (requestedProfileId === undefined) return undefined

  return resolveEmissionProfile({
    invoice: { recipientTaxId: '', senderTaxId: '' },
    profiles: catalog.map(toCandidate),
    requestedProfileId,
  })
}

function toProjectionProfile({
  profile,
  resolution,
  ruleVersion,
}: {
  readonly profile: CteEmissionProfileDetail
  readonly resolution: EmissionProfileResolution
  readonly ruleVersion: FreightRuleVersionReference
}): CteBatchProjectionProfile {
  return {
    chargeComponentLabel: profile.chargeComponentLabel,
    components: profile.components.map((component) => ({
      ...component,
      ordinal: BigInt(component.ordinal),
    })),
    id: profile.id,
    matchedBy: resolution.matchedBy,
    name: profile.name,
    resolvedBy: resolution.matchedBy === 'manual' ? 'manual' : 'auto',
    ruleSnapshot: createFreightRuleSnapshot({
      freightRuleId: profile.freightRuleId,
      freightRuleVersionId: ruleVersion.id,
      maximumAmount: profile.freightRule.maximumAmount,
      minimumAmount: profile.freightRule.minimumAmount,
      percentage: profile.freightRule.percentage,
      ruleVersion: ruleVersion.version,
      type: 'percentage_of_invoice_total',
      validFrom: profile.freightRule.validFrom,
      validUntil: profile.freightRule.validUntil,
    }),
  }
}

function toCandidate(profile: CteEmissionProfileDetail): EmissionProfileCandidate {
  return {
    id: profile.id,
    matchMode: profile.matchMode,
    matchers: profile.matchers,
    name: profile.name,
    priority: BigInt(profile.priority),
    status: profile.status,
  }
}

function blockDocument(documentId: string, reason: string): CteBatchPreviewBlock {
  return { batchId: null, documentId, reason }
}
