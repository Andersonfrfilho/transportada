/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T6/T15: o canhoto que o escritório grava — junto com a entrega (`field-delivery`) ou
 * depois dela (`field-proof`) —, sempre dentro da transação da ação. Um lugar só para as duas rotas
 * validarem, subirem, selarem e gravarem o comprovante do mesmo jeito.
 */
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import { PHOTO_PROOF_KIND } from '../domain/delivery-event.constant.js'
import {
  buildDeliveryProofObjectKey,
  DELIVERY_PROOF_MAX_BYTES,
  isDeliveryProofMimeType,
} from '../domain/delivery-proof.policy.js'
import {
  maskTaxId,
  type DeliveryProofFieldSettings,
} from '../domain/delivery-proof-settings.policy.js'
import { PROOF_PUNCTUALITY } from '../domain/delivery-proof-punctuality.policy.js'
import { TripDeliveryProofRejectedError } from '../domain/trip.error.js'
import { TRIP_FIELD_CHANNELS } from '../domain/trip-field-channel.constant.js'
import { TripDeliveryProofAlreadyCapturedError } from '../domain/trip-field-office.error.js'
import type { DriverFieldReportTransactionPort } from './driver-field-report.port.js'
import type { FieldAuthorship } from './field-trip-target.types.js'
import type { RemovableObjectStoragePort } from './stored-object-cleanup.service.js'

/**
 * `kind` é sempre `'photo'` no canal `office`: o escritório não colhe assinatura, cumpre a exigência
 * com a foto do canhoto assinado e o nome de quem recebeu (ADR-0067 §5, D8).
 */
export type OfficeDeliveryProofUpload = {
  readonly attachmentKey: string
  readonly bytes: Uint8Array
  readonly mimeType: string
  readonly receiverDocument: string
  readonly receiverName: string
}

export type OfficeDeliveryProofAttachment = {
  readonly newObjectId: () => string
  readonly newProofId: () => string
  /** Lida **antes** da transação (spec 159 T11 item 5): a porta lê pelo pool. */
  readonly resolveSettings: (input: {
    readonly companyId: string
    readonly documentId: string
  }) => Promise<DeliveryProofFieldSettings>
  readonly sealDocument: (input: {
    readonly companyId: string
    readonly proofId: string
    readonly receiverDocument: string
  }) => Promise<SecretEnvelopeV1>
  readonly storage: RemovableObjectStoragePort
}

export type OfficeProofPersistResult = {
  readonly id: string
  /** Spec 156 T15 M1: o objeto do comprovante do escritório que este substituiu — vai para a auditoria. */
  readonly replacedObjectId: string | null
}

/** Teto e tipos do canhoto, conferidos antes de abrir a transação — arquivo recusado não gasta chave. */
export function assertOfficeUploadAccepted(upload: {
  readonly bytes: Uint8Array
  readonly mimeType: string
}): void {
  if (upload.bytes.byteLength > DELIVERY_PROOF_MAX_BYTES) {
    throw new TripDeliveryProofRejectedError('TOO_LARGE')
  }
  if (!isDeliveryProofMimeType(upload.mimeType)) {
    throw new TripDeliveryProofRejectedError('UNSUPPORTED_TYPE')
  }
}

export type PersistOfficeProofParams = {
  readonly actorUserId: string
  readonly attachment: OfficeDeliveryProofAttachment
  readonly authorship: FieldAuthorship
  readonly companyId: string
  readonly eventId: string
  /** A storage já rastreada por `runWithStoredObjectCleanup` — o que subir aqui some se desfizer. */
  readonly storage: RemovableObjectStoragePort
  readonly transaction: DriverFieldReportTransactionPort
  readonly upload: OfficeDeliveryProofUpload
}

/**
 * Grava o canhoto do escritório no evento. O mesmo `attachmentKey` devolve o comprovante já gravado
 * sem subir de novo. Spec 156 T15 M1: comprovante do motorista (app ou WhatsApp) no mesmo evento
 * **não** é substituído — 409 `TRIP_DELIVERY_PROOF_ALREADY_CAPTURED`; o do próprio escritório é
 * substituído pelo unique `(company, stop_event, kind)` da ADR-0057.
 */
export async function persistOfficeProof(
  params: PersistOfficeProofParams,
): Promise<OfficeProofPersistResult> {
  const { attachment, companyId, eventId, transaction, upload } = params

  if (upload.attachmentKey.length > 0) {
    const existingId = await transaction.findProofIdByAttachmentKeyWithinTransaction({
      attachmentKey: upload.attachmentKey,
      companyId,
      eventId,
      kind: PHOTO_PROOF_KIND,
    })
    if (existingId !== null) return { id: existingId, replacedObjectId: null }
  }

  const previous = await transaction.findProofForEvent({
    companyId,
    eventId,
    kind: PHOTO_PROOF_KIND,
  })
  if (previous !== null && previous.channel !== TRIP_FIELD_CHANNELS.office) {
    throw new TripDeliveryProofAlreadyCapturedError()
  }

  const objectId = attachment.newObjectId()
  const objectKey = buildDeliveryProofObjectKey({ companyId, eventId, objectId })
  const stored = await params.storage.store({
    bytes: upload.bytes,
    companyId,
    mimeType: upload.mimeType,
    objectId,
    objectKey,
  })

  const proofId = attachment.newProofId()
  /**
   * Spec 156 T15 A2 (ADR-0067 §5): o documento que o escritório digita passa pelo mesmo envelope e
   * pela mesma máscara do motorista (ADR-0057 §3) — nunca descartado, nunca em claro.
   */
  const { receiverDocument } = upload
  const receiverDocumentEnvelope =
    receiverDocument.length === 0
      ? null
      : await attachment.sealDocument({ companyId, proofId, receiverDocument })

  const saved = await transaction.saveDeliveryProofWithinTransaction({
    /**
     * ADR-0070 §6, spec 159 T5: o canhoto do escritório não entra na nota do motorista (RF8) —
     * grava `not_required`, sem posição nem `capturedAt`.
     */
    accuracyMeters: null,
    actorUserId: params.actorUserId,
    attachmentKey: upload.attachmentKey,
    authorship: params.authorship,
    capturedAt: null,
    companyId,
    eventId,
    id: proofId,
    kind: PHOTO_PROOF_KIND,
    latitude: null,
    longitude: null,
    mimeType: upload.mimeType,
    objectId,
    objectKey,
    punctuality: PROOF_PUNCTUALITY.notRequired,
    receiverDocumentEnvelope,
    receiverDocumentMasked: receiverDocument.length === 0 ? '' : maskTaxId(receiverDocument),
    receiverName: upload.receiverName.trim(),
    sha256: stored.sha256,
    sizeBytes: upload.bytes.byteLength,
  })

  return { id: saved.id, replacedObjectId: previous?.objectId ?? null }
}
