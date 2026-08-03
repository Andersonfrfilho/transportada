/* Copyright (c) 2026 Ada Technology. MIT License. */
import { resolveProgressPercent } from '@/modules/shared/progress.service'

export const CTE_BATCH_SUBMIT_UNKNOWN_ERROR_CODE = 'CTE_BATCH_SUBMIT_FAILED'
/** Cada lote vira uma transmissão à SEFAZ: poucos por vez em vez da seleção inteira de uma vez. */
export const CTE_BATCH_SUBMIT_CONCURRENCY = 3

export type CteBatchSubmissionTarget = Readonly<{
  id: string
  name: string
}>

export type CteBatchSubmissionOutcome = Readonly<{
  batchId: string
  batchName: string
  errorCode?: string
}>

/** O resultado viaja junto com o contador para a tela mostrar lote a lote, não só no fim. */
export type CteBatchSubmissionProgressEvent = Readonly<{
  completed: number
  outcome: CteBatchSubmissionOutcome
  total: number
}>

export type CteBatchSubmissionProgress = Readonly<{
  errorCount: number
  isComplete: boolean
  percent: number
  successCount: number
}>

export const CTE_BATCH_SUBMISSION_UNKNOWN_REASON_KEY = 'transmission.reasons.unknown'

/** Cada código que a transmissão pode devolver ganha um motivo em português; o resto cai no genérico. */
export const CTE_BATCH_SUBMISSION_REASON_KEYS: Readonly<Record<string, string>> = {
  CTE_BATCH_INVALID_STATE: 'transmission.reasons.invalidState',
  CTE_BATCH_NOT_FOUND: 'transmission.reasons.notFound',
  CTE_ISSUANCE_ALREADY_IN_FLIGHT: 'transmission.reasons.alreadyInFlight',
  CTE_ISSUANCE_EMITTER_INCOMPLETE: 'transmission.reasons.emitterIncomplete',
  CTE_ISSUANCE_FISCAL_SEQUENCE_MISSING: 'transmission.reasons.fiscalSequenceMissing',
  CTE_ISSUANCE_REQUEST_FAILED: 'transmission.reasons.requestFailed',
  CTE_ISSUANCE_REQUEST_UNCONFIRMED: 'transmission.reasons.unconfirmed',
  CTE_ISSUANCE_RESPONSE_INVALID: 'transmission.reasons.responseInvalid',
  CTE_PROFILE_FREIGHT_RULE_VERSION_MISSING: 'transmission.reasons.freightRuleMissing',
  FORBIDDEN: 'transmission.reasons.forbidden',
  IDEMPOTENCY_KEY_REUSED: 'transmission.reasons.duplicateRequest',
  IDENTITY_SESSION_EXPIRED: 'transmission.reasons.sessionExpired',
  INTERNAL_ERROR: 'transmission.reasons.serverError',
  UNAUTHENTICATED: 'transmission.reasons.sessionExpired',
}

export function resolveCteBatchSubmissionReasonKey(errorCode: string): string {
  return CTE_BATCH_SUBMISSION_REASON_KEYS[errorCode] ?? CTE_BATCH_SUBMISSION_UNKNOWN_REASON_KEY
}

function readErrorCode(caught: unknown): string {
  return caught instanceof Error && caught.message !== ''
    ? caught.message
    : CTE_BATCH_SUBMIT_UNKNOWN_ERROR_CODE
}

async function submitSingleBatch(
  input: Readonly<{
    batch: CteBatchSubmissionTarget
    submitBatch: (batchId: string) => Promise<unknown>
  }>,
): Promise<CteBatchSubmissionOutcome> {
  try {
    await input.submitBatch(input.batch.id)
    return { batchId: input.batch.id, batchName: input.batch.name }
  } catch (caught: unknown) {
    return {
      batchId: input.batch.id,
      batchName: input.batch.name,
      errorCode: readErrorCode(caught),
    }
  }
}

/**
 * A recusa de um lote não derruba os outros: cada resultado fica na posição do lote na seleção,
 * e o avanço é anunciado a cada conclusão para a barra de progresso andar durante a fila.
 */
export async function submitCteBatches(
  input: Readonly<{
    batches: readonly CteBatchSubmissionTarget[]
    onProgress?: (event: CteBatchSubmissionProgressEvent) => void
    submitBatch: (batchId: string) => Promise<unknown>
  }>,
): Promise<readonly CteBatchSubmissionOutcome[]> {
  const total = input.batches.length
  const outcomes: CteBatchSubmissionOutcome[] = []
  let nextIndex = 0
  let completed = 0

  async function consumeQueue(): Promise<void> {
    for (;;) {
      const index = nextIndex
      const batch = input.batches[index]
      if (batch === undefined) return
      nextIndex += 1
      const outcome = await submitSingleBatch({ batch, submitBatch: input.submitBatch })
      outcomes[index] = outcome
      completed += 1
      input.onProgress?.({ completed, outcome, total })
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CTE_BATCH_SUBMIT_CONCURRENCY, total) }, consumeQueue),
  )

  return outcomes
}

export function resolveCteBatchSubmissionProgress(
  input: Readonly<{
    completed: number
    outcomes: readonly CteBatchSubmissionOutcome[]
    total: number
  }>,
): CteBatchSubmissionProgress {
  const errorCount = input.outcomes.filter((outcome) => outcome.errorCode !== undefined).length

  return {
    errorCount,
    isComplete: input.total > 0 && input.completed >= input.total,
    percent: resolveProgressPercent({ completed: input.completed, total: input.total }),
    successCount: input.outcomes.length - errorCount,
  }
}
