/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripFiscalReadinessSnapshot } from './read-trip-fiscal-readiness.use-case.js'
import { TripCteBatchEmptyError } from '../domain/trip.error.js'

/**
 * Spec 065 D4bis: **o MDF-e é urgente e os CT-e ainda não saíram.**
 *
 * O lote normal espera a autorização da contratante, e é assim que deve ser. Mas há o caso em que o
 * manifesto é necessário antes disso, e hoje não existe caminho: o operador espera uma autorização
 * comercial para resolver uma necessidade fiscal.
 *
 * O que este caso de uso **não** faz é inventar um lote diferente: ele monta o lote normal, com as
 * notas da viagem, e entrega para a mesma trilha de emissão. Só o momento muda.
 */
const URGENT_BATCH_NAME_PREFIX = 'Viagem'

/**
 * As notas que ainda têm CT-e a emitir. `ok` já autorizou; `cte_in_progress` já está num lote e seria
 * recusada por vínculo; a de NFS-e não tem CT-e a emitir e entraria como linha que nunca autoriza.
 */
const PENDING_CTE_REASONS = ['no_cte', 'cte_rejected', 'cte_cancelled'] as const

export type CreateTripCteBatchInput = {
  readonly companyId: string
  readonly correlationId: string
  readonly createBatch: (input: {
    readonly companyId: string
    readonly correlationId: string
    readonly documentIds: readonly string[]
    readonly idempotencyKey: string
    readonly name: string
    readonly userId: string
  }) => Promise<{ readonly id: string }>
  readonly idempotencyKey: string
  readonly readReadiness: (input: {
    readonly companyId: string
    readonly tripId: string
  }) => Promise<TripFiscalReadinessSnapshot>
  readonly tripId: string
  readonly userId: string
}

export type CreateTripCteBatchResult = {
  readonly batchId: string
  readonly documentCount: number
}

export async function createTripCteBatch(
  input: CreateTripCteBatchInput,
): Promise<CreateTripCteBatchResult> {
  const readiness = await input.readReadiness({
    companyId: input.companyId,
    tripId: input.tripId,
  })

  const documentIds = selectPendingCteDocuments(readiness)
  /**
   * Recusar aqui é a resposta certa: um lote vazio nasceria, seria submetido e voltaria sem nada. A
   * viagem só de entrega urbana cai neste caminho, e o código diz isso em vez de um erro genérico.
   */
  if (documentIds.length === 0) throw new TripCteBatchEmptyError()

  const batch = await input.createBatch({
    companyId: input.companyId,
    correlationId: input.correlationId,
    documentIds,
    idempotencyKey: input.idempotencyKey,
    name: `${URGENT_BATCH_NAME_PREFIX} ${input.tripId.slice(0, 8)}`,
    userId: input.userId,
  })

  return { batchId: batch.id, documentCount: documentIds.length }
}

function selectPendingCteDocuments(
  readiness: TripFiscalReadinessSnapshot,
): readonly string[] {
  return readiness.documents
    .filter(
      (document) =>
        document.expectedDocument === 'cte' &&
        (PENDING_CTE_REASONS as readonly string[]).includes(document.reason),
    )
    .map((document) => document.nfeDocumentId)
    .filter((documentId): documentId is string => documentId !== null)
}
