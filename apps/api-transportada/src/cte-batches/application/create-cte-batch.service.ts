/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CteEmissionProfileDetail } from '../../cte-profiles/application/cte-emission-profile.port.js'
import {
  type CteBatchProjectionCandidate,
  projectCteBatchCharges,
} from '../domain/cte-batch-projection.service.js'
import {
  createBlockError,
  createDocumentNotEligibleError,
  createFreightRuleVersionMissingError,
  createIdempotencyConflictError,
} from '../domain/cte-batch.error.js'
import { persistFreightCalculations, persistProjections } from './cte-batch-persistence.service.js'
import type {
  CteBatchPreviewBlock,
  CteEmissionProfileCatalogPort,
} from './cte-batch-preview.port.js'
import { getRequiredRecord, getRequiredString } from './cte-batch-record.service.js'
import {
  type CteBatchSelectionParams,
  type FreightRuleVersionReference,
  selectCteBatchCandidates,
  splitDuplicatedDocumentIds,
} from './cte-batch-selection.service.js'
import type {
  CreateCteBatchInput,
  CteBatchFingerprintPort,
  CteBatchUnitOfWorkPort,
} from './cte-batch.port.js'

const TEXT_ENCODER = new TextEncoder()
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAXIMUM_DOCUMENTS_PER_BATCH = 100
const FINGERPRINT_OPERATION = 'cte-batch.create'
const CREATED_EVENT_NAME = 'created'
const DRAFT_STATUS = 'draft'

export type CreateCteBatchDependencies = {
  readonly fingerprintService: CteBatchFingerprintPort
  readonly profiles: CteEmissionProfileCatalogPort
  readonly unitOfWork: CteBatchUnitOfWorkPort
}

export async function createCteBatch(
  dependencies: CreateCteBatchDependencies,
  input: CreateCteBatchInput,
): Promise<Record<string, unknown>> {
  const documentIds = resolveDocumentIds(input.documentIds)
  const fingerprint = await dependencies.fingerprintService.create({
    fields: [
      input.context.companyId,
      input.name,
      input.emissionProfileId ?? '',
      input.groupingMode ?? '',
      ...documentIds,
    ].map((value) => TEXT_ENCODER.encode(value)),
    operation: FINGERPRINT_OPERATION,
  })
  // O catálogo vem do seu próprio repositório, que abre transação na mesma instância de `db`:
  // buscá-lo já dentro da transação do lote pediria uma segunda conexão do pool com a primeira
  // ainda presa, e a criação travaria em `idle in transaction` quando o pool estivesse cheio.
  const catalog = await dependencies.profiles.listProfiles({ companyId: input.context.companyId })
  const operation = (transaction: CteBatchUnitOfWorkPort) =>
    runCreate({ catalog, documentIds, fingerprint, input, transaction })

  return dependencies.unitOfWork.execute?.(operation) ?? operation(dependencies.unitOfWork)
}

async function runCreate({
  catalog,
  documentIds,
  fingerprint,
  input,
  transaction,
}: {
  readonly catalog: readonly CteEmissionProfileDetail[]
  readonly documentIds: readonly string[]
  readonly fingerprint: string
  readonly input: CreateCteBatchInput
  readonly transaction: CteBatchUnitOfWorkPort
}): Promise<Record<string, unknown>> {
  const companyId = input.context.companyId
  const replay = await transaction.findBatchByIdempotency({
    companyId,
    idempotencyKey: input.idempotencyKey,
  })
  if (replay !== null) return resolveCreateReplay(replay, fingerprint)

  const candidates = await resolveCandidates({
    catalog,
    companyId,
    documentIds,
    input,
    transaction,
  })
  const projections = projectCteBatchCharges(candidates)
  const batch = await transaction.createBatch({
    companyId,
    correlationId: input.correlationId,
    idempotencyFingerprint: fingerprint,
    idempotencyKey: input.idempotencyKey,
    name: input.name,
    operatorUserId: input.context.userId,
    status: DRAFT_STATUS,
    version: '1',
  })
  const batchId = getRequiredString(batch, 'id')

  const calculationIdByDocumentId = await persistFreightCalculations({
    candidates,
    fingerprint,
    input,
    transaction,
  })
  await persistProjections({
    batchId,
    calculationIdByDocumentId,
    companyId,
    projections,
    transaction,
  })
  await transaction.createBatchEvent({
    batchId,
    companyId,
    eventName: CREATED_EVENT_NAME,
    payload: {
      documentIds: [...documentIds],
      itemCount: projections.length,
      status: DRAFT_STATUS,
    },
    userId: input.context.userId,
  })

  // A linha do lote é inserida antes dos itens, então a contagem só é verdadeira aqui.
  return { ...batch, itemCount: projections.length }
}

/**
 * A seleção roda duas vezes: a primeira apura bloqueios, a segunda congela o snapshot já
 * apontando para a versão publicada da regra de frete que será persistida.
 */
async function resolveCandidates({
  catalog,
  companyId,
  documentIds,
  input,
  transaction,
}: {
  readonly catalog: readonly CteEmissionProfileDetail[]
  readonly companyId: string
  readonly documentIds: readonly string[]
  readonly input: CreateCteBatchInput
  readonly transaction: CteBatchUnitOfWorkPort
}): Promise<readonly CteBatchProjectionCandidate[]> {
  const query = { companyId, documentIds }
  const documents = await transaction.findSelectionDocuments(query)
  const links = await transaction.findActiveBatchLinks(query)
  const params: CteBatchSelectionParams = {
    catalog,
    documentIds,
    documents,
    emissionProfileId: input.emissionProfileId,
    groupingMode: input.groupingMode,
    links,
  }

  const preselection = selectCteBatchCandidates(params)
  assertNoBlocks(preselection.blocked)
  const ruleVersions = await loadRuleVersions({
    candidates: preselection.candidates,
    companyId,
    transaction,
  })
  const selection = selectCteBatchCandidates({ ...params, ruleVersions })
  assertNoBlocks(selection.blocked)

  return selection.candidates
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

function assertNoBlocks(blocked: readonly CteBatchPreviewBlock[]): void {
  const [first] = blocked
  if (first !== undefined) throw createBlockError(first.reason)
}

function resolveCreateReplay(
  replay: Record<string, unknown>,
  fingerprint: string,
): Record<string, unknown> {
  if (replay['idempotencyFingerprint'] !== fingerprint) throw createIdempotencyConflictError()

  return getRequiredRecord(replay, 'batch')
}

function resolveDocumentIds(documentIds: readonly string[]): readonly string[] {
  if (documentIds.length === 0 || documentIds.length > MAXIMUM_DOCUMENTS_PER_BATCH) {
    throw createDocumentNotEligibleError()
  }
  const duplicated = splitDuplicatedDocumentIds(documentIds.map(resolveDocumentId))
  assertNoBlocks(duplicated.blocked)

  return duplicated.documentIds
}

function resolveDocumentId(documentId: string): string {
  if (documentId.startsWith('nfe-') || UUID_PATTERN.test(documentId)) return documentId
  throw createDocumentNotEligibleError()
}
