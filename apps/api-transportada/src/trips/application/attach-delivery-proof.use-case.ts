/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import type { TripDeliveryProofKind } from '../../database/trip.schema.js'
import {
  buildDeliveryProofObjectKey,
  DELIVERY_PROOF_MAX_BYTES,
  isDeliveryProofMimeType,
} from '../domain/delivery-proof.policy.js'
import {
  maskTaxId,
  type DeliveryProofFieldSettings,
} from '../domain/delivery-proof-settings.policy.js'
import {
  TripDeliveryProofDocumentNotAcceptedError,
  TripDeliveryProofDocumentRequiredError,
  TripDeliveryProofRejectedError,
  TripDocumentNotReachableError,
} from '../domain/trip.error.js'

export type DeliveryProofUpload = {
  readonly bytes: Uint8Array
  readonly kind: TripDeliveryProofKind
  readonly mimeType: string
  /**
   * ADR-0057 §3 (revisa ADR-0045 §7): o documento de quem recebeu, na forma canônica. Vazio é o
   * caso de fábrica; ele só entra quando a configuração resolvida da empresa o aceita.
   */
  readonly receiverDocument: string
  /** Nome de quem recebeu, na assinatura. */
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
  /**
   * ADR-0057 §1: a configuração resolvida (geral + exceção pelo CNPJ do destinatário da nota).
   * Quem resolve é a infraestrutura — o caso de uso só obedece.
   */
  resolveProofFieldSettings(input: {
    readonly companyId: string
    readonly documentId: string
  }): Promise<DeliveryProofFieldSettings>
  saveProof(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly eventId: string
    readonly id: string
    readonly kind: TripDeliveryProofKind
    readonly mimeType: string
    readonly objectId: string
    readonly objectKey: string
    readonly receiverDocumentEnvelope: SecretEnvelopeV1 | null
    readonly receiverDocumentMasked: string
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
  readonly newProofId: () => string
  readonly repository: DeliveryProofPort
  /** Sela o documento em envelope A256GCM, com AAD amarrado ao `proofId`. */
  readonly sealDocument: (input: {
    readonly companyId: string
    readonly proofId: string
    readonly receiverDocument: string
  }) => Promise<SecretEnvelopeV1>
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

  /**
   * ADR-0057: quem decide se o documento entra é a configuração resolvida, nunca o app. `off` com
   * documento no corpo é recusa; `required` sem documento na assinatura também.
   */
  const settings = await input.repository.resolveProofFieldSettings({
    companyId: input.companyId,
    documentId: input.documentId,
  })
  const isSignature = input.upload.kind === 'signature'
  const receiverDocument = isSignature ? input.upload.receiverDocument : ''
  if (receiverDocument.length > 0 && settings.receiverDocument === 'off') {
    throw new TripDeliveryProofDocumentNotAcceptedError()
  }
  if (isSignature && settings.receiverDocument === 'required' && receiverDocument.length === 0) {
    throw new TripDeliveryProofDocumentRequiredError()
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

  const proofId = input.newProofId()
  const receiverDocumentEnvelope =
    receiverDocument.length === 0
      ? null
      : await input.sealDocument({ companyId: input.companyId, proofId, receiverDocument })

  return input.repository.saveProof({
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    eventId,
    id: proofId,
    kind: input.upload.kind,
    mimeType: input.upload.mimeType,
    objectId,
    objectKey,
    receiverDocumentEnvelope,
    receiverDocumentMasked: receiverDocument.length === 0 ? '' : maskTaxId(receiverDocument),
    receiverName: isSignature ? input.upload.receiverName : '',
    sha256: stored.sha256,
    sizeBytes: input.upload.bytes.byteLength,
  })
}
