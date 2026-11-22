/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 D2/D6/D7 (T4): a segunda passada da rotina `trip.canhoto.read`. A prova que o código de barras não leu
 * passa pelo OCR do Nº/Série impresso (`extractCanhotoIdentity`, na thread do motor) e o que foi lido é **reportado**
 * pela rota do robô com `readSource: 'ocr'` — o servidor nunca aprova por OCR (fica `pending`); o alerta de "canhoto de
 * outra nota" é da API (T3).
 *
 * Quando a tentativa é carimbada (`canhoto_ocr_attempted_at`): só quando a leitura **terminou** sem Nº ancorado, ou a
 * foto não abre (é da foto; repetir não muda nada). Falha de infraestrutura — objeto ausente, teto, formato, fila
 * cheia (`busy`), prazo, motor caído, API fora — não carimba: a prova volta no ciclo seguinte.
 *
 * Nunca sai daqui o texto lido nem o número: o log e os contadores (RF8) são só contagens e o id opaco da prova.
 */
import type { AttachmentObjectReaderPort } from '../../aggregate-attachment/application/extract-attachment-fields.port.js'
import { CanhotoOcrError } from '../../canhoto-ocr/application/canhoto-ocr-reader.port.js'
import { CANHOTO_OCR_MAX_IMAGE_BYTES } from '../../canhoto-ocr/domain/canhoto-ocr.constant.js'
import type { JobRoutineContext } from '../../job-run/application/job-routine.port.js'
import { safeLogWarn } from '../../logging/safe-logger.service.js'
import type { ErrorTracker } from '../../observability/sentry.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import {
  CANHOTO_NUMBER_OCR_MAX_PROOFS_PER_CYCLE,
  CANHOTO_NUMBER_OCR_MAX_READS_PER_CYCLE,
  CANHOTO_NUMBER_OCR_QUEUE_KEY,
  CANHOTO_OCR_READ_SOURCE,
  CANHOTO_SUPPORTED_MEDIA_TYPES,
} from '../domain/canhoto-read.constant.js'
import type {
  CanhotoNumberOcrQueuePort,
  PendingCanhotoNumberOcrProof,
} from './canhoto-number-ocr-queue.port.js'
import type { CanhotoNumberOcrReaderPort } from './canhoto-number-ocr-reader.port.js'
import { CanhotoReviewApiError } from './canhoto-review-api.error.js'
import type { CanhotoReviewApiPort } from './canhoto-review-api.port.js'

export type CanhotoNumberOcrPassDependencies = Readonly<{
  objectReader: AttachmentObjectReaderPort
  queue: CanhotoNumberOcrQueuePort
  reader: CanhotoNumberOcrReaderPort
}>

/** RF8: os contadores da passada no resultado do job. Só números; nunca o que foi lido. */
export type CanhotoNumberOcrCounters = {
  ocrAlreadyHandled: number
  ocrApiUnauthorized: number
  ocrApiUnreachable: number
  ocrBusy: number
  ocrEngineFailed: number
  /** Nº ancorado diferente do `nNF` da nota sob a qual a prova foi gravada (subconjunto de `ocrRead`). */
  ocrMismatch: number
  ocrNoAnchor: number
  ocrObjectUnavailable: number
  ocrProofsSeen: number
  /** Nº ancorado e reportado à API. */
  ocrRead: number
  ocrReportRejected: number
  ocrTimeout: number
  ocrTooLarge: number
  ocrUnexpectedErrors: number
  ocrUnreadable: number
  ocrUnsupportedMedia: number
}

export function createNumberOcrCounters(): CanhotoNumberOcrCounters {
  return {
    ocrAlreadyHandled: 0,
    ocrApiUnauthorized: 0,
    ocrApiUnreachable: 0,
    ocrBusy: 0,
    ocrEngineFailed: 0,
    ocrMismatch: 0,
    ocrNoAnchor: 0,
    ocrObjectUnavailable: 0,
    ocrProofsSeen: 0,
    ocrRead: 0,
    ocrReportRejected: 0,
    ocrTimeout: 0,
    ocrTooLarge: 0,
    ocrUnexpectedErrors: 0,
    ocrUnreadable: 0,
    ocrUnsupportedMedia: 0,
  }
}

type PassInput = Readonly<{
  context: JobRoutineContext
  counters: CanhotoNumberOcrCounters
  errorTracker: Pick<ErrorTracker, 'captureException'>
  logger: WorkerLogger
  now: () => Date
  ocr: CanhotoNumberOcrPassDependencies
  reviewApi: CanhotoReviewApiPort
}>

/**
 * `continue`: siga para a próxima prova. `stop`: a passada para neste ciclo — o motor está ocupado, carregando ou
 * foi derrubado (`busy`, prazo, falha), ou a API não atende: insistir só gastaria memória e tempo da batida.
 */
type ProofStep = Readonly<{ engineUsed: boolean; next: 'continue' | 'stop' }>

const CHEAP = { engineUsed: false, next: 'continue' } as const satisfies ProofStep

const OCR_ERROR_COUNTERS = {
  busy: 'ocrBusy',
  engine_failed: 'ocrEngineFailed',
  timeout: 'ocrTimeout',
} as const satisfies Record<CanhotoOcrError['reason'], keyof CanhotoNumberOcrCounters>

const API_ERROR_COUNTERS = {
  api_unauthorized: 'ocrApiUnauthorized',
  api_unreachable: 'ocrApiUnreachable',
  report_rejected: 'ocrReportRejected',
} as const

const isSupportedMediaType = (mediaType: string): boolean =>
  (CANHOTO_SUPPORTED_MEDIA_TYPES as readonly string[]).includes(mediaType)

/** `000172195` e `172195` são a mesma nota; o lido já sai sem zeros à esquerda. */
const withoutLeadingZeros = (value: string): string => value.replace(/^0+(?=\d)/u, '')

export async function runNumberOcrPass(input: PassInput): Promise<void> {
  const { context, ocr } = input
  const seenProofIds: string[] = []
  let engineReads = 0

  while (
    engineReads < CANHOTO_NUMBER_OCR_MAX_READS_PER_CYCLE &&
    seenProofIds.length < CANHOTO_NUMBER_OCR_MAX_PROOFS_PER_CYCLE &&
    !context.isStopRequested()
  ) {
    const limit = Math.min(
      CANHOTO_NUMBER_OCR_MAX_READS_PER_CYCLE,
      CANHOTO_NUMBER_OCR_MAX_PROOFS_PER_CYCLE - seenProofIds.length,
    )
    const batch = await ocr.queue.listPending({ excludeProofIds: seenProofIds, limit })

    for (const proof of batch) {
      if (context.isStopRequested() || engineReads >= CANHOTO_NUMBER_OCR_MAX_READS_PER_CYCLE) return
      seenProofIds.push(proof.proofId)
      input.counters.ocrProofsSeen += 1
      const step = await processProof(input, proof)
      if (step.engineUsed) engineReads += 1
      if (step.next === 'stop') return
    }

    if (batch.length < limit) return
  }
}

async function processProof(
  input: PassInput,
  proof: PendingCanhotoNumberOcrProof,
): Promise<ProofStep> {
  try {
    return await readAndReport(input, proof)
  } catch (error) {
    if (error instanceof CanhotoReviewApiError) {
      input.counters[API_ERROR_COUNTERS[error.outcome]] += 1
      if (error.outcome !== 'api_unreachable') input.errorTracker.captureException(error)
      logFailure(input, proof, error.outcome)
      // A leitura foi feita; só não pôde ser entregue. Recusa é desta prova; fora do ar ou sem crachá é de todas.
      return { engineUsed: true, next: error.outcome === 'report_rejected' ? 'continue' : 'stop' }
    }
    input.counters.ocrUnexpectedErrors += 1
    input.errorTracker.captureException(error)
    logFailure(input, proof, 'unexpected_error')
    return { engineUsed: true, next: 'continue' }
  }
}

async function readAndReport(
  input: PassInput,
  proof: PendingCanhotoNumberOcrProof,
): Promise<ProofStep> {
  const { counters, ocr } = input

  if (proof.sizeBytes > CANHOTO_OCR_MAX_IMAGE_BYTES) {
    counters.ocrTooLarge += 1
    logFailure(input, proof, 'too_large')
    return CHEAP
  }
  if (!isSupportedMediaType(proof.mimeType)) {
    counters.ocrUnsupportedMedia += 1
    logFailure(input, proof, 'unsupported_media')
    return CHEAP
  }
  const bytes = await ocr.objectReader.read({ bucket: proof.bucket, key: proof.objectKey })
  if (bytes === undefined) {
    counters.ocrObjectUnavailable += 1
    logFailure(input, proof, 'object_unavailable')
    return CHEAP
  }

  let result: Awaited<ReturnType<CanhotoNumberOcrReaderPort['readIdentity']>>
  try {
    result = await ocr.reader.readIdentity({ bytes, queueKey: CANHOTO_NUMBER_OCR_QUEUE_KEY })
  } catch (error) {
    if (!(error instanceof CanhotoOcrError)) throw error
    counters[OCR_ERROR_COUNTERS[error.reason]] += 1
    logFailure(input, proof, `ocr_${error.reason}`)
    return { engineUsed: error.reason !== 'busy', next: 'stop' }
  }

  if (result.kind === 'unreadable' || result.identity === null) {
    const stamped = await ocr.queue.markAttempted({
      attemptedAt: input.now(),
      companyId: proof.companyId,
      proofId: proof.proofId,
    })
    if (!stamped) counters.ocrAlreadyHandled += 1
    else if (result.kind === 'unreadable') counters.ocrUnreadable += 1
    else counters.ocrNoAnchor += 1
    return { engineUsed: true, next: 'continue' }
  }

  const { identity } = result
  await input.reviewApi.report({
    companyId: proof.companyId,
    documentId: proof.documentId,
    reading: {
      readDocumentId: null,
      readNumber: identity.number,
      readSeries: identity.series,
      readSource: CANHOTO_OCR_READ_SOURCE,
    },
    tripId: proof.tripId,
  })
  counters.ocrRead += 1
  if (
    proof.documentNumber !== null &&
    withoutLeadingZeros(proof.documentNumber) !== identity.number
  ) {
    counters.ocrMismatch += 1
  }
  return { engineUsed: true, next: 'continue' }
}

/** Só o id opaco da prova e o resultado: nunca o número lido, o texto, a chave ou os bytes. */
function logFailure(input: PassInput, proof: PendingCanhotoNumberOcrProof, outcome: string): void {
  safeLogWarn({
    logger: input.logger,
    message: 'canhoto_number_ocr_proof_failed',
    metadata: { outcome, proofId: proof.proofId },
  })
}
