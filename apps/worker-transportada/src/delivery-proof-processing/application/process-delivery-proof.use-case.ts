/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import type { CanhotoReadQueuePort } from '../../canhoto-read/application/canhoto-read-queue.port.js'
import type { CanhotoReviewApiPort } from '../../canhoto-read/application/canhoto-review-api.port.js'
import { identifyCanhotoBarcode } from '../../canhoto-read/domain/canhoto-barcode.policy.js'
import { safeLogWarn } from '../../logging/safe-logger.service.js'
import type { DeliveryProofProcessingEnvelopeV1 } from '../../messaging/delivery-proof-processing-envelope.schema.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import {
  DELIVERY_PROOF_PROCESSING_ERROR_CODES as ERROR_CODES,
  PROOF_OBJECT_PURPOSE,
  PROOF_ORIGINAL_MAX_BYTES,
  PROOF_REDUCED_MIME_TYPE,
  PROOF_SUPPORTED_MEDIA_TYPES,
  PROOF_THUMBNAIL_OBJECT_PURPOSE,
  type DeliveryProofProcessingErrorCode,
  type ProofSupportedMediaType,
} from '../domain/delivery-proof-processing.constant.js'
import type { DeliveryProofImagePort } from './delivery-proof-image.port.js'
import { DeliveryProofProcessingError } from './delivery-proof-processing.error.js'
import type {
  DeliveryProofObjectStoragePort,
  DeliveryProofProcessingRepositoryPort,
  NewProofObject,
  ProofToProcess,
  StoredObjectRef,
} from './delivery-proof-processing.port.js'

export type ProcessDeliveryProofDependencies = Readonly<{
  /**
   * A leitura do código de barras sobre o original (RF5). Ausente quando a instalação não declara o
   * crachá do robô: o canhoto fica `pending` e a rotina `trip.canhoto.read` — que também não está
   * registrada nesse caso — o leria.
   */
  barcode?: Readonly<{
    queue: Pick<CanhotoReadQueuePort, 'listTripDocuments' | 'markAttempted'>
    reviewApi: CanhotoReviewApiPort
  }>
  image: DeliveryProofImagePort
  logger: WorkerLogger
  newObjectId: () => string
  now: () => Date
  objects: DeliveryProofObjectStoragePort
  repository: DeliveryProofProcessingRepositoryPort
}>

export type DeliveryProofBarcodeOutcome = 'failed' | 'reported' | 'skipped' | 'unusable'

/**
 * `ready` e `failed` mexem no comprovante; os demais são "nada a fazer": `already_ready` (reentrega),
 * `not_applicable` (o comprovante subiu já leve), `proof_missing` (a entrega foi apagada), `stale`
 * (recaptura com evento antigo em voo) e `superseded` (outro tratamento chegou antes).
 */
export type ProcessDeliveryProofResult = Readonly<{
  barcode: DeliveryProofBarcodeOutcome
  errorCode?: DeliveryProofProcessingErrorCode
  originalBytes?: number
  outcome:
    | 'already_ready'
    | 'failed'
    | 'not_applicable'
    | 'proof_missing'
    | 'ready'
    | 'stale'
    | 'superseded'
  reducedBytes?: number
  thumbnailBytes?: number
}>

function noop(outcome: ProcessDeliveryProofResult['outcome']): ProcessDeliveryProofResult {
  return { barcode: 'skipped', outcome }
}

function isSupportedMediaType(mimeType: string): mimeType is ProofSupportedMediaType {
  return (PROOF_SUPPORTED_MEDIA_TYPES as readonly string[]).includes(mimeType)
}

/** A mesma convenção de chave da API: opaca, por empresa e evento — nunca nome de pessoa (`security.md` §7). */
export function buildDeliveryProofObjectKey(input: {
  readonly companyId: string
  readonly objectId: string
  readonly stopEventId: string
}): string {
  return `tenants/${input.companyId}/delivery-proofs/${input.stopEventId}/${input.objectId}`
}

/**
 * Spec 265 RF5-RF8. Idempotente pelo **estado no banco**, como a prévia da 237: `ready` é no-op, a troca
 * do objeto só vale enquanto a linha ainda é a do original e a finalização tem a própria guarda. A ordem
 * é a que torna cada passo repetível: grava os objetos novos → troca `object_id` (numa transação) → lê o
 * código de barras do original → apaga o original **do storage** → só então fecha `ready` anulando a
 * referência. Falha antes do fim deixa o original no lugar (RF8) e a reentrega retoma.
 *
 * A leitura do código de barras **não** segura o `ready`: falha de API ou de banco nela só é registrada,
 * e o canhoto — ainda `pending`, sem tentativa — cai na rotina `trip.canhoto.read`, que agora lê o objeto
 * leve. Perde-se a resolução total, não o canhoto.
 */
export async function processDeliveryProof(
  envelope: DeliveryProofProcessingEnvelopeV1,
  dependencies: ProcessDeliveryProofDependencies,
): Promise<ProcessDeliveryProofResult> {
  const { companyId } = envelope
  const { proofId } = envelope.payload
  const proof = await dependencies.repository.load({ companyId, proofId })
  if (proof === undefined) return noop('proof_missing')
  if (proof.state === 'ready') return noop('already_ready')
  if (proof.state === null || proof.original === null) return noop('not_applicable')
  // Recaptura: o evento é de um arquivo que já não é o da linha (RF7).
  if (proof.original.objectKey !== envelope.payload.objectKey) return noop('stale')

  const { original } = proof
  const marked = await dependencies.repository.markProcessing({
    companyId,
    originalObjectId: original.objectId,
    proofId,
  })
  if (!marked) return noop('superseded')

  // A troca já aconteceu numa tentativa anterior: falta só apagar o original e fechar.
  if (proof.current.objectId !== original.objectId) {
    return finalize({ dependencies, original, proofId, companyId, summary: { barcode: 'skipped' } })
  }

  return processFromOriginal({ companyId, dependencies, original, proof })
}

async function processFromOriginal(input: {
  readonly companyId: string
  readonly dependencies: ProcessDeliveryProofDependencies
  readonly original: StoredObjectRef
  readonly proof: ProofToProcess
}): Promise<ProcessDeliveryProofResult> {
  const { companyId, dependencies, original, proof } = input

  if (original.sizeBytes > PROOF_ORIGINAL_MAX_BYTES) {
    return fail({ code: ERROR_CODES.originalTooLarge, companyId, dependencies, original, proof })
  }
  if (!isSupportedMediaType(original.mimeType)) {
    return fail({ code: ERROR_CODES.imageUnsupported, companyId, dependencies, original, proof })
  }

  const bytes = await dependencies.objects.read({
    bucket: original.bucket,
    key: original.objectKey,
  })
  if (bytes === undefined) throw new DeliveryProofProcessingError(ERROR_CODES.originalMissing)

  const canReadBarcode =
    dependencies.barcode !== undefined && proof.canhotoReadable && proof.canhoto !== null
  const result = await dependencies.image.process({
    bytes,
    mediaType: original.mimeType,
    readBarcode: canReadBarcode,
    withThumbnail: !proof.hasThumbnail,
  })
  if (result.kind === 'rejected') {
    return fail({ code: result.code, companyId, dependencies, original, proof })
  }

  const reduced = describeObject({
    bucket: original.bucket,
    bytes: result.reduced.bytes,
    companyId,
    dependencies,
    purpose: PROOF_OBJECT_PURPOSE,
    stopEventId: proof.stopEventId,
  })
  const thumbnail =
    result.thumbnail === null
      ? null
      : describeObject({
          bucket: original.bucket,
          bytes: result.thumbnail.bytes,
          companyId,
          dependencies,
          purpose: PROOF_THUMBNAIL_OBJECT_PURPOSE,
          stopEventId: proof.stopEventId,
        })

  const stored = await storeAndSwap({
    companyId,
    dependencies,
    original,
    proofId: proof.proofId,
    reduced: { bytes: result.reduced.bytes, object: reduced },
    thumbnail:
      thumbnail === null || result.thumbnail === null
        ? null
        : { bytes: result.thumbnail.bytes, object: thumbnail },
  })
  if (!stored) return noop('superseded')

  const barcode = canReadBarcode
    ? await reportBarcode({ barcodeText: result.barcodeText, companyId, dependencies, proof })
    : 'skipped'

  return finalize({
    companyId,
    dependencies,
    original,
    proofId: proof.proofId,
    summary: {
      barcode,
      originalBytes: bytes.byteLength,
      reducedBytes: result.reduced.bytes.byteLength,
      ...(result.thumbnail === null ? {} : { thumbnailBytes: result.thumbnail.bytes.byteLength }),
    },
  })
}

function describeObject(input: {
  readonly bucket: string
  readonly bytes: Uint8Array
  readonly companyId: string
  readonly dependencies: ProcessDeliveryProofDependencies
  readonly purpose: string
  readonly stopEventId: string
}): NewProofObject {
  const objectId = input.dependencies.newObjectId()
  return {
    bucket: input.bucket,
    mimeType: PROOF_REDUCED_MIME_TYPE,
    objectId,
    objectKey: buildDeliveryProofObjectKey({
      companyId: input.companyId,
      objectId,
      stopEventId: input.stopEventId,
    }),
    purpose: input.purpose,
    sha256: createHash('sha256').update(input.bytes).digest('hex'),
    sizeBytes: input.bytes.byteLength,
  }
}

type StoredBytes = Readonly<{ bytes: Uint8Array; object: NewProofObject }>

/**
 * Objetos no bucket **antes** da troca no banco: a linha nunca aponta para o que não existe. Se a
 * troca falha ou perde a corrida, os objetos novos saem do bucket (melhor esforço) — sem dono, ninguém
 * os acharia depois.
 */
async function storeAndSwap(input: {
  readonly companyId: string
  readonly dependencies: ProcessDeliveryProofDependencies
  readonly original: StoredObjectRef
  readonly proofId: string
  readonly reduced: StoredBytes
  readonly thumbnail: StoredBytes | null
}): Promise<boolean> {
  const { dependencies } = input
  const written: NewProofObject[] = []
  try {
    for (const item of [input.reduced, input.thumbnail]) {
      if (item === null) continue
      await dependencies.objects.store({
        bucket: item.object.bucket,
        bytes: item.bytes,
        key: item.object.objectKey,
        mimeType: item.object.mimeType,
        sha256: item.object.sha256,
      })
      written.push(item.object)
    }

    const swapped = await dependencies.repository.swapToReduced({
      companyId: input.companyId,
      originalObjectId: input.original.objectId,
      proofId: input.proofId,
      reduced: input.reduced.object,
      thumbnail: input.thumbnail?.object ?? null,
    })
    if (!swapped) await removeQuietly(dependencies, written)
    return swapped
  } catch (error) {
    await removeQuietly(dependencies, written)
    throw error
  }
}

async function removeQuietly(
  dependencies: ProcessDeliveryProofDependencies,
  objects: readonly NewProofObject[],
): Promise<void> {
  for (const object of objects) {
    await dependencies.objects
      .remove({ bucket: object.bucket, key: object.objectKey })
      .catch(() => undefined)
  }
}

async function reportBarcode(input: {
  readonly barcodeText: string | null
  readonly companyId: string
  readonly dependencies: ProcessDeliveryProofDependencies
  readonly proof: ProofToProcess
}): Promise<DeliveryProofBarcodeOutcome> {
  const { companyId, dependencies, proof } = input
  const { barcode } = dependencies
  if (barcode === undefined || proof.canhoto === null) return 'skipped'

  try {
    const identification = identifyCanhotoBarcode({
      text: input.barcodeText,
      tripDocuments: await barcode.queue.listTripDocuments({
        companyId,
        tripId: proof.canhoto.tripId,
      }),
    })
    if (identification.kind === 'unusable') {
      await barcode.queue.markAttempted({
        attemptedAt: dependencies.now(),
        companyId,
        proofId: proof.proofId,
      })
      return 'unusable'
    }

    await barcode.reviewApi.report({
      companyId,
      documentId: proof.canhoto.documentId,
      reading: {
        readDocumentId: identification.readDocumentId,
        readNumber: identification.readNumber,
        readSeries: identification.readSeries,
        readSource: identification.readSource,
      },
      tripId: proof.canhoto.tripId,
    })
    return 'reported'
  } catch (error) {
    // Só o id opaco e o nome da classe do erro: nunca o texto lido, a chave nem a mensagem.
    safeLogWarn({
      logger: dependencies.logger,
      message: 'delivery_proof_barcode_failed',
      metadata: {
        proofId: proof.proofId,
        reason: error instanceof Error ? error.name : 'unknown',
      },
    })
    return 'failed'
  }
}

/**
 * RF8: o original sai do bucket **antes** de a referência cair — se o `delete` falha, a linha segue
 * `processing` apontando para ele e a reentrega repete. A FK `restrict` obriga a ordem inversa no
 * banco (anular, depois marcar `deleted`), e é por isso que as duas escritas moram numa transação só.
 */
async function finalize(input: {
  readonly companyId: string
  readonly dependencies: ProcessDeliveryProofDependencies
  readonly original: StoredObjectRef
  readonly proofId: string
  readonly summary: Pick<
    ProcessDeliveryProofResult,
    'barcode' | 'originalBytes' | 'reducedBytes' | 'thumbnailBytes'
  >
}): Promise<ProcessDeliveryProofResult> {
  const { companyId, dependencies, original, proofId } = input
  await dependencies.objects.remove({ bucket: original.bucket, key: original.objectKey })
  const closed = await dependencies.repository.finalizeReady({
    companyId,
    originalObjectId: original.objectId,
    proofId,
  })
  if (!closed) return { ...input.summary, outcome: 'superseded' }
  return { ...input.summary, outcome: 'ready' }
}

async function fail(input: {
  readonly code: DeliveryProofProcessingErrorCode
  readonly companyId: string
  readonly dependencies: ProcessDeliveryProofDependencies
  readonly original: StoredObjectRef
  readonly proof: ProofToProcess
}): Promise<ProcessDeliveryProofResult> {
  const recorded = await input.dependencies.repository.markFailed({
    code: input.code,
    companyId: input.companyId,
    originalObjectId: input.original.objectId,
    proofId: input.proof.proofId,
  })
  return {
    barcode: 'skipped',
    errorCode: input.code,
    originalBytes: input.original.sizeBytes,
    outcome: recorded ? 'failed' : 'superseded',
  }
}

/**
 * O que o consumidor grava quando as tentativas do trilho acabam: o código da última falha conhecida,
 * ou `PROCESSING_ABANDONED`. Nunca a mensagem do erro (`processing_error` é só código).
 */
export function resolveAbandonCode(error: unknown): DeliveryProofProcessingErrorCode {
  return error instanceof DeliveryProofProcessingError
    ? error.code
    : ERROR_CODES.processingAbandoned
}

/** `markFailed` do consumidor: precisa do `objectId` do original, que a mensagem não carrega (só a chave). */
export async function abandonDeliveryProof(
  envelope: DeliveryProofProcessingEnvelopeV1,
  input: {
    readonly code: DeliveryProofProcessingErrorCode
    readonly repository: DeliveryProofProcessingRepositoryPort
  },
): Promise<void> {
  const proof = await input.repository.load({
    companyId: envelope.companyId,
    proofId: envelope.payload.proofId,
  })
  if (proof?.original == null || proof.state === 'ready') return
  if (proof.original.objectKey !== envelope.payload.objectKey) return
  await input.repository.markFailed({
    code: input.code,
    companyId: envelope.companyId,
    originalObjectId: proof.original.objectId,
    proofId: envelope.payload.proofId,
  })
}
