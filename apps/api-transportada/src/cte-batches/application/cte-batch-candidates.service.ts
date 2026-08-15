/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CteEmissionProfileDetail } from '../../cte-profiles/application/cte-emission-profile.port.js'
import type { CteBatchProjectionCandidate } from '../domain/cte-batch-projection.service.js'
import {
  createBlockError,
  createDocumentNotEligibleError,
  createFreightRuleVersionMissingError,
} from '../domain/cte-batch.error.js'
import type { CteBatchPreviewBlock } from './cte-batch-preview.port.js'
import { getRequiredString } from './cte-batch-record.service.js'
import {
  type CteBatchSelectionParams,
  type FreightRuleVersionReference,
  selectCteBatchCandidates,
  splitDuplicatedDocumentIds,
} from './cte-batch-selection.service.js'
import type { CteBatchUnitOfWorkPort, CteBatchWriteInput } from './cte-batch.port.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * A seleção roda duas vezes: a primeira apura bloqueios, a segunda congela o snapshot já
 * apontando para a versão publicada da regra de frete que será persistida.
 */
export async function resolveCteBatchCandidates({
  catalog,
  companyId,
  documentIds,
  input,
  transaction,
}: {
  readonly catalog: readonly CteEmissionProfileDetail[]
  readonly companyId: string
  readonly documentIds: readonly string[]
  readonly input: CteBatchWriteInput
  readonly transaction: CteBatchUnitOfWorkPort
}): Promise<readonly CteBatchProjectionCandidate[]> {
  const query = { companyId, documentIds }
  const documents = await transaction.findSelectionDocuments(query)
  const links = await transaction.findActiveBatchLinks(query)
  const nfseLinks = await transaction.findActiveNfseLinks(query)
  const params: CteBatchSelectionParams = {
    catalog,
    documentIds,
    documents,
    emissionProfileId: input.emissionProfileId,
    groupingMode: input.groupingMode,
    links,
    nfseLinks,
  }

  const preselection = selectCteBatchCandidates(params)
  assertNoCteBatchBlocks(preselection.blocked)
  const ruleVersions = await loadRuleVersions({
    candidates: preselection.candidates,
    companyId,
    transaction,
  })
  const selection = selectCteBatchCandidates({ ...params, ruleVersions })
  assertNoCteBatchBlocks(selection.blocked)

  return selection.candidates
}

export function assertNoCteBatchBlocks(blocked: readonly CteBatchPreviewBlock[]): void {
  const [first] = blocked
  if (first !== undefined) throw createBlockError(first.reason)
}

/**
 * O teto por requisição vive no schema HTTP, que é onde o limite de corpo de 1 MiB morde. O
 * domínio não impõe teto próprio: a seleção grande chega fatiada, e cada fatia entra no mesmo lote.
 */
export function resolveCteBatchDocumentIds(documentIds: readonly string[]): readonly string[] {
  if (documentIds.length === 0) throw createDocumentNotEligibleError()
  const duplicated = splitDuplicatedDocumentIds(documentIds.map(resolveDocumentId))
  assertNoCteBatchBlocks(duplicated.blocked)

  return duplicated.documentIds
}

async function loadRuleVersions({
  candidates,
  companyId,
  transaction,
}: {
  readonly candidates: readonly CteBatchProjectionCandidate[]
  readonly companyId: string
  readonly transaction: CteBatchUnitOfWorkPort
}): Promise<ReadonlyMap<string, FreightRuleVersionReference>> {
  const freightRuleIds = new Set(
    candidates.map((candidate) => candidate.profile.ruleSnapshot.freightRuleId),
  )
  const ruleVersions = new Map<string, FreightRuleVersionReference>()
  for (const freightRuleId of freightRuleIds) {
    // sequencial de propósito: as leituras rodam na mesma transação/conexão do lote
    const ruleVersion = await transaction.findFreightRuleVersion({ companyId, freightRuleId })
    if (ruleVersion === null) throw createFreightRuleVersionMissingError()
    ruleVersions.set(freightRuleId, {
      id: getRequiredString(ruleVersion, 'id'),
      version: getRequiredString(ruleVersion, 'version'),
    })
  }

  return ruleVersions
}

function resolveDocumentId(documentId: string): string {
  if (documentId.startsWith('nfe-') || UUID_PATTERN.test(documentId)) return documentId
  throw createDocumentNotEligibleError()
}
