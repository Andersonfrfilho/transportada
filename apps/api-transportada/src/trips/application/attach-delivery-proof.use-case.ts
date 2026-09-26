/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import type { Coordinate } from '../../addresses/domain/coordinate-distance.js'
import type { TripDeliveryProofKind } from '../../database/trip.schema.js'
import {
  classifyProofPunctuality,
  mergeProofPunctuality,
  PROOF_PUNCTUALITY,
  type ProofPosition,
  type ProofPunctuality,
} from '../domain/delivery-proof-punctuality.policy.js'
import {
  buildDeliveryProofObjectKey,
  DELIVERY_PROOF_MAX_BYTES,
  isDeliveryProofMimeType,
} from '../domain/delivery-proof.policy.js'
import {
  maskTaxId,
  type DeliveryProofFieldSettings,
  type DeliveryProofPunctualitySettings,
} from '../domain/delivery-proof-settings.policy.js'
import {
  TripDeliveryProofDocumentNotAcceptedError,
  TripDeliveryProofDocumentRequiredError,
  TripDeliveryProofRejectedError,
  TripDocumentNotReachableError,
} from '../domain/trip.error.js'
import { TRIP_FIELD_CHANNELS } from '../domain/trip-field-channel.constant.js'
import { PHOTO_PROOF_KIND } from '../domain/delivery-event.constant.js'
import {
  deriveFieldAuthorship,
  toFieldTripTarget,
  type FieldAuthorship,
  type FieldTripLocator,
  type FieldTripTarget,
} from './field-trip-target.types.js'

export type DeliveryProofUpload = {
  /**
   * Spec 082 (revisão, item 5): chave de idempotência opcional do anexo. Reenvio com a mesma chave
   * para o mesmo documento+tipo converge na linha existente, sem regravar objeto. Vazio quando o
   * app não a manda — e aí todo reenvio é correção, como antes.
   */
  readonly attachmentKey: string
  readonly bytes: Uint8Array
  /** ADR-0070 §3, spec 159 RF3/RF5: o que o aparelho diz ter tirado a foto — não confiável sozinho. */
  readonly capturedAt: Date | undefined
  readonly kind: TripDeliveryProofKind
  readonly mimeType: string
  /** ADR-0070 §4, spec 159 RF3/RF6: onde o aparelho leu a posição ao tirar a foto. */
  readonly position: ProofPosition | undefined
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
  /** `null` quando a nota não é da viagem do alvo, ou não tem entrega registrada nela. */
  findDeliveryEventId(input: {
    readonly companyId: string
    readonly documentId: string
    readonly target: FieldTripTarget
  }): Promise<string | null>
  /**
   * ADR-0057 §1: a configuração resolvida (geral + exceção pelo CNPJ do destinatário da nota).
   * Quem resolve é a infraestrutura — o caso de uso só obedece.
   */
  resolveProofFieldSettings(input: {
    readonly companyId: string
    readonly documentId: string
  }): Promise<DeliveryProofFieldSettings>
  /** ADR-0070 §3-5, spec 159 RF7: os parâmetros de pontualidade da empresa — geral, sem exceção. */
  resolveProofPunctualitySettings(input: {
    readonly companyId: string
  }): Promise<DeliveryProofPunctualitySettings>
  /**
   * ADR-0070 §5, spec 159 RF5/RF6: o que `classifyProofPunctuality` precisa do evento de entrega —
   * quando e onde a baixa aconteceu. Lido pelo `eventId` já resolvido, não pela nota.
   */
  findDeliveryContext(input: { readonly companyId: string; readonly eventId: string }): Promise<{
    readonly deliveredAt: Date
    readonly deliveryEventPosition: Coordinate | undefined
  }>
  /** `null` quando nenhum comprovante daquele evento+tipo foi gravado com esta chave. */
  findProofIdByAttachmentKey(input: {
    readonly attachmentKey: string
    readonly companyId: string
    readonly eventId: string
    readonly kind: TripDeliveryProofKind
  }): Promise<{ readonly id: string; readonly punctuality: ProofPunctuality } | null>
  /**
   * Spec 159 T11: a pontualidade da foto que a substituta vai sobrescrever (upsert por
   * evento+tipo). `null` quando o evento ainda não tem comprovante daquele tipo.
   */
  findProofPunctuality(input: {
    readonly companyId: string
    readonly eventId: string
    readonly kind: TripDeliveryProofKind
  }): Promise<ProofPunctuality | null>
  saveProof(input: {
    readonly accuracyMeters: string | null
    readonly actorUserId: string
    readonly attachmentKey: string
    readonly authorship: FieldAuthorship
    readonly capturedAt: Date | null
    readonly companyId: string
    readonly eventId: string
    readonly id: string
    readonly kind: TripDeliveryProofKind
    readonly latitude: string | null
    readonly longitude: string | null
    readonly mimeType: string
    readonly objectId: string
    readonly objectKey: string
    readonly punctuality: ProofPunctuality
    readonly receiverDocumentEnvelope: SecretEnvelopeV1 | null
    readonly receiverDocumentMasked: string
    readonly receiverName: string
    readonly sha256: string
    readonly sizeBytes: number
  }): Promise<{ readonly id: string }>
}

export type AttachDeliveryProofInput = FieldTripLocator & {
  readonly actorUserId: string
  readonly companyId: string
  readonly documentId: string
  readonly newObjectId: () => string
  readonly newProofId: () => string
  /** ADR-0070 §3, spec 159 RF5: quando o servidor recebeu a foto — referência sem `capturedAt`. */
  readonly now: Date
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
): Promise<{ readonly id: string; readonly punctuality: ProofPunctuality }> {
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
    target: toFieldTripTarget(input),
  })
  if (eventId === null) throw new TripDocumentNotReachableError()

  /**
   * Retry de rede converge sem tocar no bucket: a mesma chave já gravou este comprovante — e a
   * pontualidade já gravada não é recalculada (spec 159, casos extremos).
   */
  if (input.upload.attachmentKey.length > 0) {
    const existing = await input.repository.findProofIdByAttachmentKey({
      attachmentKey: input.upload.attachmentKey,
      companyId: input.companyId,
      eventId,
      kind: input.upload.kind,
    })
    if (existing !== null) return existing
  }

  const authorship = deriveFieldAuthorship(input)
  const punctuality = mergeProofPunctuality({
    next: await classifyUploadPunctuality({ authorship, eventId, input, settings }),
    previous:
      (await input.repository.findProofPunctuality({
        companyId: input.companyId,
        eventId,
        kind: input.upload.kind,
      })) ?? undefined,
  })

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
  /**
   * ADR-0067 §5 (emenda 2026-09-18): o canhoto do escritório é sempre `kind: 'photo'`, e é o único
   * caso em que uma foto carrega `receiverName` — quem assina é o recebedor, não o escritório, e
   * `receiverName` é como ele cumpre a exigência de assinatura sem colhê-la (D8). O CHECK do banco
   * (`trip_delivery_proofs_receiver_check`) foi relaxado para `channel = 'office'` na mesma migration.
   */
  const carriesReceiverName = isSignature || authorship.channel === TRIP_FIELD_CHANNELS.office

  const proof = await input.repository.saveProof({
    accuracyMeters: input.upload.position?.accuracyMeters?.toFixed(2) ?? null,
    actorUserId: input.actorUserId,
    attachmentKey: input.upload.attachmentKey,
    authorship,
    capturedAt: input.upload.capturedAt ?? null,
    companyId: input.companyId,
    eventId,
    id: proofId,
    kind: input.upload.kind,
    latitude: input.upload.position?.latitude ?? null,
    longitude: input.upload.position?.longitude ?? null,
    mimeType: input.upload.mimeType,
    objectId,
    objectKey,
    punctuality,
    receiverDocumentEnvelope,
    receiverDocumentMasked: receiverDocument.length === 0 ? '' : maskTaxId(receiverDocument),
    receiverName: carriesReceiverName ? input.upload.receiverName : '',
    sha256: stored.sha256,
    sizeBytes: input.upload.bytes.byteLength,
  })

  return { ...proof, punctuality }
}

/**
 * ADR-0070 §2-6, spec 159 RF4-RF6: só a foto do motorista entra na nota — a assinatura grava
 * `not_required` de propósito (RF4). Spec 159 T11 (ALTO 2): a foto do escritório (`field-proof`,
 * canal `office`) também — ela não classifica, e a fusão com a anterior
 * (`mergeProofPunctuality`) preserva o que a foto do motorista já tinha gravado: o canhoto do
 * escritório nem penaliza o motorista nem lava uma foto dele fora da regra.
 */
async function classifyUploadPunctuality(params: {
  readonly authorship: FieldAuthorship
  readonly eventId: string
  readonly input: AttachDeliveryProofInput
  readonly settings: DeliveryProofFieldSettings
}): Promise<ProofPunctuality> {
  if (params.input.upload.kind !== PHOTO_PROOF_KIND) return PROOF_PUNCTUALITY.notRequired
  if (params.authorship.channel === TRIP_FIELD_CHANNELS.office) return PROOF_PUNCTUALITY.notRequired

  return classifyPhotoPunctuality(params)
}

/**
 * RF4-RF6: junta a configuração de pontualidade da empresa com o contexto do evento de entrega
 * (quando e onde aconteceu) e aplica `classifyProofPunctuality`. Só chamada para `kind = 'photo'`.
 */
async function classifyPhotoPunctuality(params: {
  readonly eventId: string
  readonly input: AttachDeliveryProofInput
  readonly settings: DeliveryProofFieldSettings
}): Promise<ProofPunctuality> {
  const { eventId, input, settings } = params
  const [punctualitySettings, context] = await Promise.all([
    input.repository.resolveProofPunctualitySettings({ companyId: input.companyId }),
    input.repository.findDeliveryContext({ companyId: input.companyId, eventId }),
  ])

  return classifyProofPunctuality({
    capturedAt: input.upload.capturedAt,
    deliveredAt: context.deliveredAt,
    deliveryEventPosition: context.deliveryEventPosition,
    missingAfterHours: punctualitySettings.missingAfterHours,
    photoMode: settings.photo,
    photoPosition: input.upload.position,
    proofRadiusMeters: punctualitySettings.proofRadiusMeters,
    proofWindowMinutes: punctualitySettings.proofWindowMinutes,
    receivedAt: input.now,
  })
}
