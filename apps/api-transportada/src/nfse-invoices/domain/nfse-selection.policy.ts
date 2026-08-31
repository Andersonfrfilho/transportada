/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  type SharedEligibilityBlockReason,
  type SharedEligibilityDocument,
  checkSharedEligibility,
} from '../../cte-batches/domain/cte-batch-eligibility.policy.js'
import type { NfseTaker } from '../../database/nfse.schema.js'
import type { NfseProjectionCandidate, NfseProjectionProfile } from './nfse-projection.service.js'
import { type NfsePartyAddress, resolveNfseTakerAddress } from './nfse-taker-address.policy.js'

export const NFSE_SELECTION_BLOCK_REASON = {
  alreadyLinked: 'NFSE_DOCUMENT_ALREADY_LINKED',
  duplicated: 'NFSE_DOCUMENT_DUPLICATED',
  linkedToCteBatch: 'NFSE_DOCUMENT_LINKED_TO_CTE_BATCH',
  missingTakerAddress: 'NFSE_DOCUMENT_MISSING_TAKER_ADDRESS',
  missingTakerName: 'NFSE_DOCUMENT_MISSING_TAKER_NAME',
  notFound: 'NFSE_DOCUMENT_NOT_FOUND',
} as const

/**
 * A elegibilidade compartilhada é a mesma do CT-e — o serviço prestado é o mesmo transporte —,
 * então as razões dela entram no vocabulário sem tradução: duas palavras para o mesmo bloqueio
 * confundem quem lê. O peso é a exceção, e por isso não é `CteBatchBlockReason` inteiro: o RPS não
 * declara massa, e barrar a nota por um campo que nunca sai no documento travava emissão real.
 */
export type NfseSelectionBlockReason =
  | (typeof NFSE_SELECTION_BLOCK_REASON)[keyof typeof NFSE_SELECTION_BLOCK_REASON]
  | SharedEligibilityBlockReason

export type NfseSelectionDocument = SharedEligibilityDocument & {
  readonly accessKey: string
  readonly documentId: string
  readonly issuedAt: string
  readonly number: string
  readonly recipientAddress: NfsePartyAddress | null
  readonly recipientLegalName: string | null
  readonly senderAddress: NfsePartyAddress | null
  readonly senderLegalName: string | null
  readonly series: string
}

export type NfseSelectionProfile = NfseProjectionProfile & {
  readonly taker: NfseTaker
}

export type NfseSelectionBlock = {
  readonly documentId: string
  readonly number: string | null
  readonly reason: NfseSelectionBlockReason
  readonly series: string | null
}

export type NfseSelection = {
  readonly blocked: readonly NfseSelectionBlock[]
  readonly candidates: readonly NfseProjectionCandidate[]
}

export type SelectNfseCandidatesParams = {
  readonly cteBatchLinks: ReadonlyMap<string, string>
  readonly documentIds: readonly string[]
  readonly documents: readonly NfseSelectionDocument[]
  readonly nfseLinks: ReadonlyMap<string, string>
  readonly profile: NfseSelectionProfile
}

type ResolvedTaker = {
  readonly legalName: string
  readonly taxId: string
}

export function selectNfseCandidates({
  cteBatchLinks,
  documentIds,
  documents,
  nfseLinks,
  profile,
}: SelectNfseCandidatesParams): NfseSelection {
  const documentsById = new Map(documents.map((document) => [document.documentId, document]))
  const seen = new Set<string>()
  const blocked: NfseSelectionBlock[] = []
  const candidates: NfseProjectionCandidate[] = []

  for (const documentId of documentIds) {
    if (seen.has(documentId)) {
      const duplicate = documentsById.get(documentId)
      blocked.push({
        documentId,
        number: duplicate?.number ?? null,
        reason: NFSE_SELECTION_BLOCK_REASON.duplicated,
        series: duplicate?.series ?? null,
      })
      continue
    }
    seen.add(documentId)

    const document = documentsById.get(documentId)
    if (document === undefined) {
      blocked.push({
        documentId,
        number: null,
        reason: NFSE_SELECTION_BLOCK_REASON.notFound,
        series: null,
      })
      continue
    }

    const eligibility = checkSharedEligibility(document)
    if (eligibility.reason !== undefined) {
      blocked.push({
        documentId,
        number: document.number,
        reason: eligibility.reason,
        series: document.series,
      })
      continue
    }

    const linkReason = resolveLinkBlockReason({ cteBatchLinks, documentId, nfseLinks })
    if (linkReason !== undefined) {
      blocked.push({
        documentId,
        number: document.number,
        reason: linkReason,
        series: document.series,
      })
      continue
    }

    const taker = resolveTaker({ document, taker: profile.taker })
    if (taker === null) {
      blocked.push({
        documentId,
        number: document.number,
        reason: NFSE_SELECTION_BLOCK_REASON.missingTakerName,
        series: document.series,
      })
      continue
    }

    const takerAddress = resolveNfseTakerAddress(
      profile.taker === '0' ? document.senderAddress : document.recipientAddress,
    )
    if (takerAddress === null) {
      blocked.push({
        documentId,
        number: document.number,
        reason: NFSE_SELECTION_BLOCK_REASON.missingTakerAddress,
        series: document.series,
      })
      continue
    }

    candidates.push({
      document: {
        accessKey: document.accessKey,
        documentId: document.documentId,
        issuedAt: document.issuedAt,
        number: document.number,
        series: document.series,
        takerAddress,
        takerLegalName: taker.legalName,
        takerTaxId: taker.taxId,
        totalAmount: eligibility.chargeable.totalAmount,
      },
      profile,
    })
  }

  return { blocked, candidates }
}

function resolveLinkBlockReason({
  cteBatchLinks,
  documentId,
  nfseLinks,
}: {
  readonly cteBatchLinks: ReadonlyMap<string, string>
  readonly documentId: string
  readonly nfseLinks: ReadonlyMap<string, string>
}): NfseSelectionBlockReason | undefined {
  // Emitir CT-e e nota de serviço para o mesmo transporte é bitributação.
  if (cteBatchLinks.has(documentId)) return NFSE_SELECTION_BLOCK_REASON.linkedToCteBatch
  if (nfseLinks.has(documentId)) return NFSE_SELECTION_BLOCK_REASON.alreadyLinked

  return undefined
}

/** A prefeitura exige a razão social do tomador; o CT-e vive só com o CNPJ, a NFS-e não. */
function resolveTaker({
  document,
  taker,
}: {
  readonly document: NfseSelectionDocument
  readonly taker: NfseTaker
}): ResolvedTaker | null {
  const legalName = taker === '0' ? document.senderLegalName : document.recipientLegalName
  const taxId = taker === '0' ? document.senderTaxId : document.recipientTaxId
  if (legalName === null || legalName.trim().length === 0 || taxId === null) return null

  return { legalName: legalName.trim(), taxId }
}
