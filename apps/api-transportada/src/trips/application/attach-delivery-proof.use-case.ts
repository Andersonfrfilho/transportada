/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripDeliveryProofKind } from '../../database/trip.schema.js'
import {
  buildDeliveryProofObjectKey,
  DELIVERY_PROOF_MAX_BYTES,
  isDeliveryProofMimeType,
} from '../domain/delivery-proof.policy.js'
import {
  TripDeliveryProofRejectedError,
  TripDocumentNotReachableError,
} from '../domain/trip.error.js'

export type DeliveryProofUpload = {
  readonly bytes: Uint8Array
  readonly kind: TripDeliveryProofKind
  readonly mimeType: string
  /** Nome de quem recebeu, na assinatura. **Nunca CPF** — ADR-0045 §7. */
  readonly receiverName: string
}

export type DeliveryProofStoragePort = {
  store(input: {
    readonly bytes: Uint8Array
    readonly companyId: string
    readonly mimeType: string
    readonly objectId: string
    readonly objectKey: string
  }): Promise<{ readonly sha256: string }>
}

export type DeliveryProofPort = {
  /** `null` quando a nota não é de uma viagem ativa deste motorista, ou não foi entregue por ele. */
  findDeliveryEventId(input: {
    readonly companyId: string
    readonly documentId: string
    readonly driverId: string
  }): Promise<string | null>
  saveProof(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly eventId: string
    readonly kind: TripDeliveryProofKind
    readonly mimeType: string
    readonly objectId: string
    readonly objectKey: string
    readonly receiverName: string
    readonly sha256: string
    readonly sizeBytes: number
  }): Promise<{ readonly id: string }>
}

export type AttachDeliveryProofInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly documentId: string
  readonly driverId: string
  readonly newObjectId: () => string
  readonly repository: DeliveryProofPort
  readonly storage: DeliveryProofStoragePort
  readonly upload: DeliveryProofUpload
}

/**
 * Spec 057, P2 "o comprovante". Ele anexa **a uma entrega que já aconteceu**: a confirmação nunca
 * espera pelo arquivo, porque em 3G ruim esperar é perder a entrega.
 */
export async function attachDeliveryProof(
  input: AttachDeliveryProofInput,
): Promise<{ readonly id: string }> {
  if (input.upload.bytes.byteLength > DELIVERY_PROOF_MAX_BYTES) {
    throw new TripDeliveryProofRejectedError('TOO_LARGE')
  }
  if (!isDeliveryProofMimeType(input.upload.mimeType)) {
    throw new TripDeliveryProofRejectedError('UNSUPPORTED_TYPE')
  }

  const eventId = await input.repository.findDeliveryEventId({
    companyId: input.companyId,
    documentId: input.documentId,
    driverId: input.driverId,
  })
  if (eventId === null) throw new TripDocumentNotReachableError()

  const objectId = input.newObjectId()
  const objectKey = buildDeliveryProofObjectKey({
    companyId: input.companyId,
    eventId,
    objectId,
  })
  const stored = await input.storage.store({
    bytes: input.upload.bytes,
    companyId: input.companyId,
    mimeType: input.upload.mimeType,
    objectId,
    objectKey,
  })

  return input.repository.saveProof({
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    eventId,
    kind: input.upload.kind,
    mimeType: input.upload.mimeType,
    objectId,
    objectKey,
    receiverName: input.upload.kind === 'signature' ? input.upload.receiverName : '',
    sha256: stored.sha256,
    sizeBytes: input.upload.bytes.byteLength,
  })
}
