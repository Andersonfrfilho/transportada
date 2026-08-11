/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { projectCteBatchCharges } from '../domain/cte-batch-projection.service.js'
import { createNotFoundError } from '../domain/cte-batch.error.js'
import {
  resolveCteBatchCandidates,
  resolveCteBatchDocumentIds,
} from './cte-batch-candidates.service.js'
import { persistFreightCalculations, persistProjections } from './cte-batch-persistence.service.js'
import type { CteEmissionProfileCatalogPort } from './cte-batch-preview.port.js'
import type {
  AppendCteBatchItemsInput,
  CteBatchFingerprintPort,
  CteBatchUnitOfWorkPort,
} from './cte-batch.port.js'

const TEXT_ENCODER = new TextEncoder()
const FINGERPRINT_OPERATION = 'cte-batch.append-items'
const APPENDED_EVENT_NAME = 'items_appended'
const DRAFT_STATUS = 'draft'

export type AppendCteBatchItemsDependencies = {
  readonly fingerprintService: CteBatchFingerprintPort
  readonly profiles: CteEmissionProfileCatalogPort
  readonly unitOfWork: CteBatchUnitOfWorkPort
}

/**
 * Uma seleção grande chega fatiada por causa do corpo de 1 MiB, e cada fatia posterior à primeira
 * entra aqui: o operador escolheu um lote só, e é um lote só que ele recebe de volta.
 */
export async function appendCteBatchItems(
  dependencies: AppendCteBatchItemsDependencies,
  input: AppendCteBatchItemsInput,
): Promise<Record<string, unknown>> {
  const documentIds = resolveCteBatchDocumentIds(input.documentIds)
  const fingerprint = await dependencies.fingerprintService.create({
    fields: [
      input.context.companyId,
      input.batchId,
      input.emissionProfileId ?? '',
      input.groupingMode ?? '',
      ...documentIds,
    ].map((value) => TEXT_ENCODER.encode(value)),
    operation: FINGERPRINT_OPERATION,
  })
  // Mesma razão do `create`: buscar o catálogo dentro da transação pediria uma segunda conexão
  // do pool com a primeira ainda presa, e a escrita travaria em `idle in transaction`.
  const catalog = await dependencies.profiles.listProfiles({ companyId: input.context.companyId })
  const operation = (transaction: CteBatchUnitOfWorkPort) =>
    runAppend({ catalog, documentIds, fingerprint, input, transaction })

  return dependencies.unitOfWork.execute?.(operation) ?? operation(dependencies.unitOfWork)
}

async function runAppend({
  catalog,
  documentIds,
  fingerprint,
  input,
  transaction,
}: {
  readonly catalog: Awaited<ReturnType<CteEmissionProfileCatalogPort['listProfiles']>>
  readonly documentIds: readonly string[]
  readonly fingerprint: string
  readonly input: AppendCteBatchItemsInput
  readonly transaction: CteBatchUnitOfWorkPort
}): Promise<Record<string, unknown>> {
  const companyId = input.context.companyId
  // Trava a linha antes de ler a contagem: fatias concorrentes serializam aqui e nenhuma
  // reaproveita a mesma posição.
  await transaction.touchBatch({ batchId: input.batchId, companyId, expectedStatus: DRAFT_STATUS })
  const batch = await transaction.findBatch({ batchId: input.batchId, companyId })
  if (batch === null || batch.companyId !== companyId) throw createNotFoundError()

  const positionOffset = resolveItemCount(batch)
  const candidates = await resolveCteBatchCandidates({
    catalog,
    companyId,
    documentIds,
    input,
    transaction,
  })
  const projections = projectCteBatchCharges(candidates)
  const calculationIdByDocumentId = await persistFreightCalculations({
    candidates,
    fingerprint,
    input,
    transaction,
  })
  await persistProjections({
    batchId: input.batchId,
    calculationIdByDocumentId,
    companyId,
    positionOffset,
    projections,
    transaction,
  })

  const itemCount = positionOffset + projections.length
  await transaction.createBatchEvent({
    batchId: input.batchId,
    companyId,
    eventName: APPENDED_EVENT_NAME,
    payload: {
      documentIds: [...documentIds],
      itemCount,
      status: DRAFT_STATUS,
    },
    userId: input.context.userId,
  })

  return { ...batch, itemCount }
}

function resolveItemCount(batch: Record<string, unknown>): number {
  const itemCount = batch['itemCount']
  if (typeof itemCount === 'number') return itemCount
  if (typeof itemCount === 'string' && itemCount.trim() !== '') return Number(itemCount)

  return 0
}
