/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  JobRoutine,
  JobRoutineContext,
  JobRoutineResult,
} from '../../job-run/application/job-routine.port.js'
import { safeLogInfo, safeLogWarn } from '../../logging/safe-logger.service.js'
import type { ErrorTracker } from '../../observability/sentry.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import {
  type CanhotoTripDocument,
  identifyCanhotoBarcode,
} from '../domain/canhoto-barcode.policy.js'
import {
  CANHOTO_READ_BATCH_SIZE,
  CANHOTO_READ_MAX_PROOFS_PER_CYCLE,
  type CanhotoReadFailureOutcome,
} from '../domain/canhoto-read.constant.js'
import type { CanhotoImageReaderPort } from './canhoto-image-reader.service.js'
import type { CanhotoReadQueuePort, PendingCanhotoProof } from './canhoto-read-queue.port.js'
import { CanhotoReviewApiError } from './canhoto-review-api.error.js'
import type { CanhotoReviewApiPort } from './canhoto-review-api.port.js'

const APPROVED_REVIEW = 'approved'
const SENTRY_OUTCOMES: ReadonlySet<CanhotoReadFailureOutcome> = new Set([
  'api_unauthorized',
  'report_rejected',
])
const FAILURE_COUNTER_KEYS = {
  api_unauthorized: 'apiUnauthorized',
  api_unreachable: 'apiUnreachable',
  decode_timeout: 'decodeTimeout',
  object_unavailable: 'objectUnavailable',
  report_rejected: 'reportRejected',
  too_large: 'tooLarge',
  unsupported_media: 'unsupportedMedia',
} as const satisfies Record<CanhotoReadFailureOutcome, string>

export type CanhotoReadRoutineDependencies = {
  readonly errorTracker: Pick<ErrorTracker, 'captureException'>
  readonly imageReader: CanhotoImageReaderPort
  readonly logger: WorkerLogger
  readonly now: () => Date
  readonly queue: CanhotoReadQueuePort
  readonly reviewApi: CanhotoReviewApiPort
}

type Counters = Record<
  | (typeof FAILURE_COUNTER_KEYS)[CanhotoReadFailureOutcome]
  | 'alreadyHandled'
  | 'approved'
  | 'attemptedWithoutCode'
  | 'pending'
  | 'proofsSeen'
  | 'reported'
  | 'unexpectedErrors',
  number
>

type ProofInput = {
  readonly counters: Counters
  readonly dependencies: CanhotoReadRoutineDependencies
  readonly proof: PendingCanhotoProof
  readonly tripDocuments: TripDocumentCache
}

/**
 * As notas da viagem são as mesmas para todo comprovante dela, e o motorista sobe os canhotos de uma
 * entrega em sequência — sem isto, vinte entregas da mesma viagem são vinte consultas iguais.
 *
 * O cache vive **dentro do lote**, nunca no ciclo: o lote é fixado por um `SELECT` antes de qualquer
 * consulta de notas, então nenhum comprovante dele pode ser mais novo que o cache. Guardado por
 * ciclo, uma nota criada entre dois lotes deixaria o comprovante dela sem candidato — e "sem código"
 * carimba a tentativa e tira o comprovante da fila para sempre.
 */
type TripDocumentCache = Map<string, readonly CanhotoTripDocument[]>

async function loadTripDocuments(input: ProofInput): Promise<readonly CanhotoTripDocument[]> {
  const { proof, tripDocuments } = input
  const key = `${proof.companyId}:${proof.tripId}`
  const cached = tripDocuments.get(key)
  if (cached !== undefined) return cached

  const loaded = await input.dependencies.queue.listTripDocuments({
    companyId: proof.companyId,
    tripId: proof.tripId,
  })
  tripDocuments.set(key, loaded)
  return loaded
}

function createCounters(): Counters {
  return {
    alreadyHandled: 0,
    apiUnauthorized: 0,
    apiUnreachable: 0,
    approved: 0,
    attemptedWithoutCode: 0,
    decodeTimeout: 0,
    objectUnavailable: 0,
    pending: 0,
    proofsSeen: 0,
    reportRejected: 0,
    reported: 0,
    tooLarge: 0,
    unexpectedErrors: 0,
    unsupportedMedia: 0,
  }
}

/**
 * ADR-0092: o worker lê a fila por SQL, decodifica o código de barras e **reporta** o que leu — o
 * veredito é do servidor, e máquina nunca recusa. Falha de um comprovante é resultado contado: o
 * ciclo sempre termina `succeeded` e os outros comprovantes do lote seguem.
 */
export function createCanhotoReadRoutine(dependencies: CanhotoReadRoutineDependencies): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

async function runCycle(input: {
  readonly context: JobRoutineContext
  readonly dependencies: CanhotoReadRoutineDependencies
}): Promise<JobRoutineResult> {
  const { context, dependencies } = input
  const counters = createCounters()
  const seenProofIds: string[] = []

  // Parada é lida no limite do comprovante: o que já terminou está gravado, o resto espera a batida.
  while (seenProofIds.length < CANHOTO_READ_MAX_PROOFS_PER_CYCLE && !context.isStopRequested()) {
    const limit = Math.min(
      CANHOTO_READ_BATCH_SIZE,
      CANHOTO_READ_MAX_PROOFS_PER_CYCLE - seenProofIds.length,
    )
    const batch = await dependencies.queue.listPending({ excludeProofIds: seenProofIds, limit })
    const tripDocuments: TripDocumentCache = new Map()

    for (const proof of batch) {
      if (context.isStopRequested()) break
      seenProofIds.push(proof.proofId)
      counters.proofsSeen += 1
      await processProof({ counters, dependencies, proof, tripDocuments })
    }

    if (batch.length < limit) break
  }

  safeLogInfo({
    logger: dependencies.logger,
    message: 'canhoto_read_cycle_finished',
    metadata: {
      ...counters,
      correlationId: context.correlationId,
      executionId: context.executionId,
      exhausted: seenProofIds.length >= CANHOTO_READ_MAX_PROOFS_PER_CYCLE,
    },
  })

  return { counters, outcome: 'succeeded' }
}

async function processProof(input: ProofInput): Promise<void> {
  try {
    await readAndReport(input)
  } catch (error) {
    if (error instanceof CanhotoReviewApiError) {
      recordFailure({ ...input, outcome: error.outcome, error })
      return
    }
    input.counters.unexpectedErrors += 1
    input.dependencies.errorTracker.captureException(error)
    logProofFailure({ ...input, outcome: 'unexpected_error' })
  }
}

async function readAndReport(input: ProofInput): Promise<void> {
  const { counters, dependencies, proof } = input
  const result = await dependencies.imageReader.read(proof)
  if (result.kind === 'failed') {
    recordFailure({ ...input, outcome: result.outcome })
    return
  }

  const identification = identifyCanhotoBarcode({
    text: result.text,
    tripDocuments: await loadTripDocuments(input),
  })

  if (identification.kind === 'unusable') {
    const stamped = await dependencies.queue.markAttempted({
      attemptedAt: dependencies.now(),
      companyId: proof.companyId,
      proofId: proof.proofId,
    })
    if (stamped) counters.attemptedWithoutCode += 1
    else counters.alreadyHandled += 1
    return
  }

  const { review } = await dependencies.reviewApi.report({
    companyId: proof.companyId,
    documentId: proof.documentId,
    reading: {
      readDocumentId: identification.readDocumentId,
      readNumber: identification.readNumber,
      readSeries: identification.readSeries,
      readSource: identification.readSource,
    },
    tripId: proof.tripId,
  })
  counters.reported += 1
  if (review === APPROVED_REVIEW) counters.approved += 1
  else counters.pending += 1
}

function recordFailure(
  input: ProofInput & {
    readonly error?: CanhotoReviewApiError
    readonly outcome: CanhotoReadFailureOutcome
  },
): void {
  input.counters[FAILURE_COUNTER_KEYS[input.outcome]] += 1
  if (input.error !== undefined && SENTRY_OUTCOMES.has(input.outcome)) {
    input.dependencies.errorTracker.captureException(input.error)
  }
  logProofFailure(input)
}

/** Só o id opaco do comprovante e o resultado: nunca o texto lido, a chave, o nome ou os bytes. */
function logProofFailure(input: ProofInput & { readonly outcome: string }): void {
  safeLogWarn({
    logger: input.dependencies.logger,
    message: 'canhoto_read_proof_failed',
    metadata: { outcome: input.outcome, proofId: input.proof.proofId },
  })
}
