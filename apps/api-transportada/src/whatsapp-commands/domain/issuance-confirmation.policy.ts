/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T013 — de que grupos a confirmação é feita (D6.2), lidos **só do pedido congelado**: um
 * lote de CT-e por perfil e uma NFS-e por (perfil NFS-e, tomador). Nome do lote e chaves saem daqui,
 * e é por isso que repetir a confirmação converge em vez de virar conflito de idempotência.
 */
import type { WhatsAppCommandClassificationEntry } from '../../database/whatsapp-command.schema.js'
import type { CompanyPermission } from '../../identity/domain/authorization.policy.js'
import { normalizeTaxId } from '../../shared/tax-id.service.js'
import {
  buildCteBatchIdempotencyKey,
  buildCteIssueIdempotencyKey,
  buildNfseGroupKey,
  buildNfseInvoiceIdempotencyKey,
} from './issuance-idempotency.policy.js'

export type CteIssuanceGroup = Readonly<{
  documentIds: readonly string[]
  groupKey: string
  idempotencyKey: string
  issueIdempotencyKey: string
  kind: 'cte_batch'
  profileId: string
  profileName: string | null
}>

export type NfseIssuanceGroup = Readonly<{
  documentIds: readonly string[]
  groupKey: string
  idempotencyKey: string
  kind: 'nfse_invoice'
  nfseProfileId: string
  takerTaxId: string
}>

export type IssuanceGroup = CteIssuanceGroup | NfseIssuanceGroup

/** Criar o lote é `cte.manage`, transmiti-lo é `cte.submit`: a confirmação faz as duas coisas. */
export const CTE_ISSUANCE_PERMISSIONS = ['cte.manage', 'cte.submit'] as const
export const NFSE_ISSUANCE_PERMISSIONS = ['nfse.issue'] as const

/** O teto do `name` em `POST /cte-batches` (`cte-batch.schema.ts`). */
const CTE_BATCH_NAME_MAX_LENGTH = 100
const REQUEST_PREFIX_LENGTH = 8
const TAKER_SUFFIX_LENGTH = 4

/**
 * `undefined` quando alguma nota a emitir não tem o grupo congelado — o pedido é anterior à T013, e
 * a confirmação o trata como prévia vencida pela base: congela de novo em vez de adivinhar o grupo.
 */
export function buildIssuanceGroups(input: {
  readonly classification: readonly WhatsAppCommandClassificationEntry[]
  readonly requestId: string
}): readonly IssuanceGroup[] | undefined {
  const cte = new Map<string, { documentIds: string[]; profileName: string | null }>()
  const nfse = new Map<
    string,
    { documentIds: string[]; nfseProfileId: string; takerTaxId: string }
  >()
  for (const entry of input.classification) {
    const { classification } = entry
    if (classification.output === 'cte') {
      if (entry.profileId === undefined || entry.profileId === null) return undefined
      const group = cte.get(entry.profileId) ?? {
        documentIds: [],
        profileName: entry.profileName ?? null,
      }
      group.documentIds.push(entry.documentId)
      cte.set(entry.profileId, group)
    }
    if (classification.output === 'nfse') {
      if (entry.takerTaxId === undefined || entry.takerTaxId === null) return undefined
      const takerTaxId = normalizeTaxId(entry.takerTaxId)
      const nfseProfileId = classification.nfseProfileId
      const groupKey = buildNfseGroupKey({ nfseProfileId, takerTaxId })
      const group = nfse.get(groupKey) ?? { documentIds: [], nfseProfileId, takerTaxId }
      group.documentIds.push(entry.documentId)
      nfse.set(groupKey, group)
    }
  }
  const { requestId } = input
  return [
    ...[...cte].map(([profileId, group]) => ({
      documentIds: group.documentIds,
      groupKey: profileId,
      idempotencyKey: buildCteBatchIdempotencyKey({ profileId, requestId }),
      issueIdempotencyKey: buildCteIssueIdempotencyKey({ profileId, requestId }),
      kind: 'cte_batch' as const,
      profileId,
      profileName: group.profileName,
    })),
    ...[...nfse].map(([groupKey, group]) => ({
      documentIds: group.documentIds,
      groupKey,
      idempotencyKey: buildNfseInvoiceIdempotencyKey({ ...group, requestId }),
      kind: 'nfse_invoice' as const,
      nfseProfileId: group.nfseProfileId,
      takerTaxId: group.takerTaxId,
    })),
  ]
}

export function listIssuanceKeys(groups: readonly IssuanceGroup[]): readonly string[] {
  return groups.flatMap((group) =>
    group.kind === 'cte_batch'
      ? [group.idempotencyKey, group.issueIdempotencyKey]
      : [group.idempotencyKey],
  )
}

export function requiredIssuancePermissions(
  groups: readonly IssuanceGroup[],
): readonly CompanyPermission[] {
  const hasCte = groups.some((group) => group.kind === 'cte_batch')
  const hasNfse = groups.some((group) => group.kind === 'nfse_invoice')
  return [
    ...(hasCte ? CTE_ISSUANCE_PERMISSIONS : []),
    ...(hasNfse ? NFSE_ISSUANCE_PERMISSIONS : []),
  ]
}

/** Determinístico sobre o pedido congelado: o nome entra na digital do `create` do lote. */
export function buildCteBatchName(group: CteIssuanceGroup, requestId: string): string {
  const label = group.profileName ?? group.profileId.slice(0, REQUEST_PREFIX_LENGTH)
  return `WhatsApp ${requestId.slice(0, REQUEST_PREFIX_LENGTH)} · ${label}`.slice(
    0,
    CTE_BATCH_NAME_MAX_LENGTH,
  )
}

/** Como o grupo aparece na resposta ao usuário: o perfil pelo nome, o tomador pelo fim do documento. */
export function describeIssuanceGroup(group: IssuanceGroup): string {
  if (group.kind === 'cte_batch') return group.profileName ?? 'Perfil de CT-e'
  return `NFS-e · tomador final ${group.takerTaxId.slice(-TAKER_SUFFIX_LENGTH)}`
}
