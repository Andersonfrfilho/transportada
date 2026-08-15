/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FreightRuleSnapshot } from '../../freight-calculations/domain/freight-calculation-engine.service.js'
import {
  NfseEmissionProfileNotActiveError,
  NfseFreightRuleVersionMissingError,
  NfseSelectionBlockedError,
} from '../domain/nfse-issuance.error.js'
import type { NfseProjectionCandidate } from '../domain/nfse-projection.service.js'
import {
  type NfseSelection,
  type NfseSelectionBlock,
  type NfseSelectionProfile,
  selectNfseCandidates,
} from '../domain/nfse-selection.policy.js'
import type {
  NfseFreightRuleVersion,
  NfseInvoiceProfile,
  NfseInvoiceReaderPort,
} from './nfse-invoice.port.js'

const ACTIVE_PROFILE_STATUS = 'active'
const RULE_TYPE = 'percentage_of_invoice_total'

/**
 * O perfil de NFS-e não tem componentes próprios: o serviço é o frete, e o valor sai da regra
 * congelada mais o rótulo do componente principal.
 */
const NO_COMPONENTS = [] as const

export type NfseCandidateResolution = NfseSelection & {
  readonly profile: NfseSelectionProfile
}

export type ResolveNfseCandidatesParams = {
  readonly companyId: string
  readonly documentIds: readonly string[]
  readonly profile: NfseInvoiceProfile
  readonly reader: NfseInvoiceReaderPort
}

/**
 * A seleção roda duas vezes: a primeira apura bloqueios sem pagar a busca da versão da regra, a
 * segunda congela o snapshot já apontando para a versão publicada que a nota vai persistir.
 */
export async function resolveNfseCandidates({
  companyId,
  documentIds,
  profile,
  reader,
}: ResolveNfseCandidatesParams): Promise<NfseCandidateResolution> {
  const query = { companyId, documentIds }
  const [cteBatchLinks, documents, nfseLinks] = await Promise.all([
    reader.findActiveCteBatchLinks(query),
    reader.findSelectionDocuments(query),
    reader.findActiveInvoiceLinks(query),
  ])
  const params = {
    cteBatchLinks: toLinkMap(cteBatchLinks),
    documentIds,
    documents,
    nfseLinks: toLinkMap(nfseLinks),
  }

  const preselection = selectNfseCandidates({
    ...params,
    profile: buildSelectionProfile({ profile, ruleVersion: null }),
  })
  if (preselection.candidates.length === 0) {
    return { ...preselection, profile: buildSelectionProfile({ profile, ruleVersion: null }) }
  }

  const ruleVersion = await reader.findFreightRuleVersion({
    companyId,
    freightRuleId: profile.freightRuleId,
  })
  if (ruleVersion === null) throw new NfseFreightRuleVersionMissingError()

  const frozenProfile = buildSelectionProfile({ profile, ruleVersion })
  return { ...selectNfseCandidates({ ...params, profile: frozenProfile }), profile: frozenProfile }
}

export function assertNoNfseBlocks(blocked: readonly NfseSelectionBlock[]): void {
  const [first] = blocked
  if (first !== undefined) throw new NfseSelectionBlockedError(first.reason)
}

export function assertProfileIsActive(profile: NfseInvoiceProfile): NfseInvoiceProfile {
  if (profile.status !== ACTIVE_PROFILE_STATUS) throw new NfseEmissionProfileNotActiveError()
  return profile
}

export function toNfseProjectionCandidates(
  resolution: NfseCandidateResolution,
): readonly NfseProjectionCandidate[] {
  return resolution.candidates
}

function toLinkMap(
  links: readonly { readonly documentId: string; readonly ownerId: string }[],
): ReadonlyMap<string, string> {
  return new Map(links.map((link) => [link.documentId, link.ownerId]))
}

/**
 * `ruleVersion: null` é a primeira passada: os bloqueios não dependem do percentual, e apurá-los
 * antes evita buscar a versão da regra para uma seleção que já está inteira barrada.
 */
function buildSelectionProfile({
  profile,
  ruleVersion,
}: {
  readonly profile: NfseInvoiceProfile
  readonly ruleVersion: NfseFreightRuleVersion | null
}): NfseSelectionProfile {
  return {
    chargeComponentLabel: profile.chargeComponentLabel,
    components: NO_COMPONENTS,
    id: profile.id,
    issRate: profile.issRate,
    ruleSnapshot: buildRuleSnapshot({ freightRuleId: profile.freightRuleId, ruleVersion }),
    taker: profile.taker,
  }
}

function buildRuleSnapshot({
  freightRuleId,
  ruleVersion,
}: {
  readonly freightRuleId: string
  readonly ruleVersion: NfseFreightRuleVersion | null
}): FreightRuleSnapshot {
  if (ruleVersion === null) {
    return {
      freightRuleId,
      freightRuleVersionId: '',
      maximumAmount: null,
      minimumAmount: null,
      percentage: '0',
      ruleVersion: '0',
      type: RULE_TYPE,
      validFrom: new Date(0).toISOString(),
      validUntil: null,
    }
  }

  return {
    freightRuleId,
    freightRuleVersionId: ruleVersion.freightRuleVersionId,
    maximumAmount: ruleVersion.maximumAmount,
    minimumAmount: ruleVersion.minimumAmount,
    percentage: ruleVersion.percentage,
    ruleVersion: ruleVersion.ruleVersion,
    type: RULE_TYPE,
    validFrom: ruleVersion.validFrom,
    validUntil: ruleVersion.validUntil,
  }
}
