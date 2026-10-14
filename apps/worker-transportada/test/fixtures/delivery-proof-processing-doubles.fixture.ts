/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 265: dublês em memória das portas do tratamento do comprovante. O repositório reproduz as
 * guardas do de verdade (estado, original esperado, troca uma vez só) — é o que torna o contrato
 * de idempotência um teste do comportamento, não do dublê.
 */
import type {
  DeliveryProofImageParams,
  DeliveryProofImagePort,
  DeliveryProofImageResult,
} from '../../src/delivery-proof-processing/application/delivery-proof-image.port.js'
import type {
  DeliveryProofObjectStoragePort,
  DeliveryProofProcessingRepositoryPort,
  NewProofObject,
  ProofToProcess,
  StoredObjectRef,
  SwapToReducedParams,
} from '../../src/delivery-proof-processing/application/delivery-proof-processing.port.js'
import type { ProcessDeliveryProofDependencies } from '../../src/delivery-proof-processing/application/process-delivery-proof.use-case.js'
import type { DeliveryProofProcessingState } from '../../src/database/delivery-proof-processing.schema.js'
import type { DeliveryProofProcessingEnvelopeV1 } from '../../src/messaging/delivery-proof-processing-envelope.schema.js'
import { DELIVERY_PROOF_PROCESSING_EVENT_TYPE } from '../../src/delivery-proof-processing/domain/delivery-proof-processing.constant.js'
import type { CanhotoTripDocument } from '../../src/canhoto-read/domain/canhoto-barcode.policy.js'
import type { WorkerLogger } from '../../src/shared/worker.types.js'

export const BUCKET = 'transportada-private'
export const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
export const PROOF_ID = '22222222-2222-4222-8222-222222222222'
export const ORIGINAL_OBJECT_ID = '33333333-3333-4333-8333-333333333333'
export const STOP_EVENT_ID = '44444444-4444-4444-8444-444444444444'
export const TRIP_ID = '55555555-5555-4555-8555-555555555555'
export const DOCUMENT_ID = '66666666-6666-4666-8666-666666666666'
export const ORIGINAL_KEY = `tenants/${COMPANY_ID}/delivery-proofs/${STOP_EVENT_ID}/${ORIGINAL_OBJECT_ID}`
export const ORIGINAL_BYTES = new Uint8Array(3 * 1024 * 1024).fill(9)
export const REDUCED_BYTES = new Uint8Array(512 * 1024).fill(3)
export const THUMBNAIL_BYTES = new Uint8Array(40 * 1024).fill(5)

type ProofRow = {
  canhotoReadable: boolean
  hasThumbnail: boolean
  objectId: string
  originalObjectId: string | null
  processingError: string | null
  state: DeliveryProofProcessingState | null
  thumbnailObjectId: string | null
}

type ObjectRow = StoredObjectRef & { status: 'deleted' | 'final' }

export function buildEnvelope(
  overrides: { readonly objectKey?: string } = {},
): DeliveryProofProcessingEnvelopeV1 {
  return {
    companyId: COMPANY_ID,
    correlationId: 'correlation-265',
    eventId: crypto.randomUUID(),
    occurredAt: new Date(0).toISOString(),
    payload: {
      attachmentKey: 'attachment-1',
      objectKey: overrides.objectKey ?? ORIGINAL_KEY,
      proofId: PROOF_ID,
      variant: 'original',
    },
    type: DELIVERY_PROOF_PROCESSING_EVENT_TYPE.REQUESTED,
    version: 1,
  }
}

export function createInMemoryProofRepository(
  initial: Partial<ProofRow> & { readonly sizeBytes?: number; readonly mimeType?: string } = {},
) {
  const proof: ProofRow = {
    canhotoReadable: initial.canhotoReadable ?? true,
    hasThumbnail: initial.hasThumbnail ?? false,
    objectId: initial.objectId ?? ORIGINAL_OBJECT_ID,
    originalObjectId:
      initial.originalObjectId === undefined ? ORIGINAL_OBJECT_ID : initial.originalObjectId,
    processingError: initial.processingError ?? null,
    state: initial.state === undefined ? 'received' : initial.state,
    thumbnailObjectId: initial.thumbnailObjectId ?? null,
  }
  const objects = new Map<string, ObjectRow>([
    [
      ORIGINAL_OBJECT_ID,
      {
        bucket: BUCKET,
        mimeType: initial.mimeType ?? 'image/jpeg',
        objectId: ORIGINAL_OBJECT_ID,
        objectKey: ORIGINAL_KEY,
        sizeBytes: initial.sizeBytes ?? ORIGINAL_BYTES.byteLength,
        status: 'final',
      },
    ],
  ])
  const calls: string[] = []
  let swapFailure: Error | undefined
  let swapLost = false
  let finalizeFailure: Error | undefined

  const repository: DeliveryProofProcessingRepositoryPort = {
    async finalizeReady(params) {
      calls.push('finalizeReady')
      if (finalizeFailure !== undefined) throw finalizeFailure
      if (
        proof.state !== 'processing' ||
        proof.originalObjectId !== params.originalObjectId ||
        proof.objectId === params.originalObjectId
      ) {
        return false
      }
      proof.originalObjectId = null
      proof.processingError = null
      proof.state = 'ready'
      const original = objects.get(params.originalObjectId)
      if (original !== undefined)
        objects.set(params.originalObjectId, { ...original, status: 'deleted' })
      return true
    },
    async load() {
      calls.push('load')
      const original =
        proof.originalObjectId === null ? undefined : objects.get(proof.originalObjectId)
      const loaded: ProofToProcess = {
        canhoto: { documentId: DOCUMENT_ID, tripId: TRIP_ID },
        canhotoReadable: proof.canhotoReadable,
        current: { objectId: proof.objectId },
        hasThumbnail: proof.thumbnailObjectId !== null || proof.hasThumbnail,
        original:
          original === undefined
            ? null
            : {
                bucket: original.bucket,
                mimeType: original.mimeType,
                objectId: original.objectId,
                objectKey: original.objectKey,
                sizeBytes: original.sizeBytes,
              },
        proofId: PROOF_ID,
        state: proof.state,
        stopEventId: STOP_EVENT_ID,
      }
      return loaded
    },
    async markFailed(params) {
      calls.push(`markFailed:${params.code}`)
      if (
        proof.originalObjectId !== params.originalObjectId ||
        proof.state === null ||
        proof.state === 'ready'
      ) {
        return false
      }
      proof.processingError = params.code
      proof.state = 'processing_failed'
      return true
    },
    async markProcessing(params) {
      calls.push('markProcessing')
      if (
        proof.originalObjectId !== params.originalObjectId ||
        proof.state === null ||
        proof.state === 'ready'
      ) {
        return false
      }
      proof.processingError = null
      proof.state = 'processing'
      return true
    },
    async swapToReduced(params: SwapToReducedParams) {
      calls.push('swapToReduced')
      if (swapFailure !== undefined) throw swapFailure
      if (
        swapLost ||
        proof.state !== 'processing' ||
        proof.originalObjectId !== params.originalObjectId ||
        proof.objectId !== params.originalObjectId
      ) {
        return false
      }
      for (const object of [params.reduced, params.thumbnail]) {
        if (object !== null) objects.set(object.objectId, { ...object, status: 'final' })
      }
      proof.objectId = params.reduced.objectId
      if (params.thumbnail !== null) proof.thumbnailObjectId = params.thumbnail.objectId
      return true
    },
  }

  return {
    calls,
    failFinalizeWith(error: Error | undefined) {
      finalizeFailure = error
    },
    failSwapWith(error: Error | undefined) {
      swapFailure = error
    },
    loseTheSwap() {
      swapLost = true
    },
    objects,
    proof,
    repository,
  }
}

export function createInMemoryObjectStorage(initial: Map<string, Uint8Array> = new Map()) {
  const blobs = new Map<string, Uint8Array>(initial)
  const calls: string[] = []
  let readFailure: Error | undefined
  let removeFailure: Error | undefined
  const locate = (location: { bucket: string; key: string }): string =>
    `${location.bucket}/${location.key}`

  const storage: DeliveryProofObjectStoragePort = {
    async read(location) {
      calls.push('read')
      if (readFailure !== undefined) throw readFailure
      return blobs.get(locate(location))
    },
    async remove(location) {
      calls.push('remove')
      if (removeFailure !== undefined && location.key === ORIGINAL_KEY) throw removeFailure
      blobs.delete(locate(location))
    },
    async store(input) {
      calls.push('store')
      blobs.set(locate({ bucket: input.bucket, key: input.key }), input.bytes)
    },
  }

  return {
    blobs,
    calls,
    failReadWith(error: Error | undefined) {
      readFailure = error
    },
    failRemoveOfOriginalWith(error: Error | undefined) {
      removeFailure = error
    },
    has: (key: string): boolean => blobs.has(locate({ bucket: BUCKET, key })),
    storage,
  }
}

export function createFakeImagePort(
  result: DeliveryProofImageResult | (() => Promise<DeliveryProofImageResult>),
) {
  const requests: DeliveryProofImageParams[] = []
  const port: DeliveryProofImagePort = {
    async process(params) {
      requests.push(params)
      return typeof result === 'function' ? result() : result
    },
  }
  return { port, requests }
}

export function processedResult(
  overrides: { readonly barcodeText?: string | null; readonly thumbnail?: boolean } = {},
): DeliveryProofImageResult {
  return {
    barcodeText: overrides.barcodeText ?? null,
    kind: 'processed',
    reduced: { bytes: REDUCED_BYTES, height: 1500, width: 2000 },
    thumbnail: overrides.thumbnail === false ? null : { bytes: THUMBNAIL_BYTES },
  }
}

export function createRecordingLogger() {
  const entries: {
    readonly level: string
    readonly message: string
    readonly metadata?: unknown
  }[] = []
  const logger: WorkerLogger = {
    error: (message, metadata) => entries.push({ level: 'error', message, metadata }),
    info: (message, metadata) => entries.push({ level: 'info', message, metadata }),
    warn: (message, metadata) => entries.push({ level: 'warn', message, metadata }),
  }
  return { entries, logger }
}

export function createBarcodeDoubles(
  tripDocuments: readonly CanhotoTripDocument[] = [],
  options: { readonly reportFailure?: Error } = {},
) {
  const stamped: string[] = []
  const reports: unknown[] = []
  const barcode: NonNullable<ProcessDeliveryProofDependencies['barcode']> = {
    queue: {
      async listTripDocuments() {
        return tripDocuments
      },
      async markAttempted(params) {
        stamped.push(params.proofId)
        return true
      },
    },
    reviewApi: {
      async report(params) {
        if (options.reportFailure !== undefined) throw options.reportFailure
        reports.push(params)
        return { review: 'approved' }
      },
    },
  }
  return { barcode, reports, stamped }
}

export function describeNew(object: NewProofObject): string {
  return `${object.purpose}:${object.mimeType}:${object.sizeBytes}`
}
