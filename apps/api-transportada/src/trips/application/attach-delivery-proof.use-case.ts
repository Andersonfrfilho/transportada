/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import type { Coordinate } from '../../addresses/domain/coordinate-distance.js'
import {
  TRIP_DELIVERY_PROOF_CARGO_KIND,
  type TripDeliveryProofKind,
} from '../../database/trip.schema.js'
import {
  classifyProofPunctuality,
  mergeProofPunctuality,
  PROOF_PUNCTUALITY,
  type ProofPosition,
  type ProofPunctuality,
} from '../domain/delivery-proof-punctuality.policy.js'
import { resolveOccurredAt } from '../domain/occurred-at.policy.js'
import {
  buildDeliveryProofObjectKey,
  DELIVERY_PROOF_MAX_BYTES,
  DELIVERY_PROOF_THUMBNAIL_MAX_BYTES,
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
import { TripDeliveryProofCargoLimitError } from '../domain/trip-field-office.error.js'
import { TRIP_FIELD_CHANNELS } from '../domain/trip-field-channel.constant.js'
import {
  CARGO_PROOF_KIND,
  PHOTO_PROOF_KIND,
  TRIP_DELIVERY_PROOF_CARGO_LIMIT,
} from '../domain/delivery-event.constant.js'
import {
  applyReceivedBySettings,
  EMPTY_RECEIVED_BY,
  type ReceivedByFields,
} from '../domain/received-by.policy.js'
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
  /** Spec 234 D2: servidor − aparelho, medido pelo app; corrige `capturedAt` em `resolveOccurredAt`. */
  readonly clockOffsetMs?: number
  readonly kind: TripDeliveryProofKind
  /**
   * Spec 205 RF3: o envio veio pelo "Registrar entrega depois" da app do motorista. Ausente é
   * `false` — o canhoto do escritório nunca o manda.
   */
  readonly lateRegistration?: boolean
  readonly mimeType: string
  /** ADR-0070 §4, spec 159 RF3/RF6: onde o aparelho leu a posição ao tirar a foto. */
  readonly position: ProofPosition | undefined
  /**
   * ADR-0057 §3 (revisa ADR-0045 §7): o documento de quem recebeu, na forma canônica. Vazio é o
   * caso de fábrica; ele só entra quando a configuração resolvida da empresa o aceita.
   */
  readonly receiverDocument: string
  /**
   * Spec 193 D1/D2: quem recebeu, já na forma tolerante (`normalizeReceivedBy`). Ausente é o
   * comprovante sem o dado — nunca recusa (C1).
   */
  readonly receivedBy?: ReceivedByFields
  /** Nome de quem recebeu — na assinatura e, desde a spec 193 D4, também na foto do canhoto. */
  readonly receiverName: string
  /** Spec 220 RF17/RF19: miniatura gerada no cliente; ausente é o caso normal, nunca condição do comprovante. */
  readonly thumbnail?: { readonly bytes: Uint8Array; readonly mimeType: string }
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
    /** Spec 205 D2: a entrega foi registrada depois (`trip_stop_events.late_registration`). */
    readonly lateRegistration?: boolean
    /**
     * Spec 234 R1: o evento de entrega gravou a hora corrigida (`occurred_at`). Ausente = não. Sem
     * isso `deliveredAt` pode ser a hora crua do aparelho, e compará-la com a foto corrigida inventa
     * atraso.
     */
    readonly isEventClockCorrected?: boolean
    /**
     * Spec 234 D4c: o evento de entrega veio do app do motorista (`trip_stop_events.channel`), o único
     * canal que coleta posição — sem posição, só essa entrega conta como longe. Obrigatório: o dublê
     * que esquecer o canal não compila.
     */
    readonly isDeliveryRecordedByDriver: boolean
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
  /**
   * Spec 184 D3 / spec 220 RF08: quantos comprovantes daquele evento+tipo já existem — o teto de
   * cinco fotos da mercadoria vale para os dois canais.
   */
  countProofsForEvent(input: {
    readonly companyId: string
    readonly eventId: string
    readonly kind: TripDeliveryProofKind
  }): Promise<number>
  saveProof(input: {
    readonly accuracyMeters: string | null
    readonly actorUserId: string
    readonly attachmentKey: string
    readonly authorship: FieldAuthorship
    /** Foto da mercadoria: a contagem contra este teto roda na transação que grava, sob trava do evento. */
    readonly cargoLimit?: number
    readonly capturedAt: Date | null
    /**
     * Spec 234 D4 (risco 5 da T1.5): o desvio com que a foto foi julgada — `null` quando a correção
     * não foi aceita ou a foto não classifica. `capturedAt` segue a hora crua do aparelho.
     */
    readonly clockOffsetMs: number | null
    readonly companyId: string
    readonly eventId: string
    readonly id: string
    readonly kind: TripDeliveryProofKind
    /** Spec 205 D1: o que este envio disse — o fato da entrega mora no evento. */
    readonly lateRegistration: boolean
    readonly latitude: string | null
    readonly longitude: string | null
    readonly mimeType: string
    readonly objectId: string
    readonly objectKey: string
    readonly punctuality: ProofPunctuality
    readonly receiverDocumentEnvelope: SecretEnvelopeV1 | null
    readonly receiverDocumentMasked: string
    readonly receiverName: string
    /** Spec 193 D3: só em `photo`/`signature`; nulo na foto da carga. */
    readonly receivedBy: ReceivedByFields['receivedBy']
    readonly receivedByDetail: string | null
    readonly sha256: string
    readonly sizeBytes: number
    /** Spec 220 RF17: o objeto da miniatura, gravado na mesma transação do original. */
    readonly thumbnail?: {
      readonly mimeType: string
      readonly objectId: string
      readonly objectKey: string
      readonly sha256: string
      readonly sizeBytes: number
    }
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
  assertThumbnailAccepted(input.upload.thumbnail)

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
  const isCargo = input.upload.kind === CARGO_PROOF_KIND
  // Só evita subir o objeto ao bucket à toa; o teto de verdade é conferido dentro do `saveProof`.
  if (isCargo) {
    const cargoCount = await input.repository.countProofsForEvent({
      companyId: input.companyId,
      eventId,
      kind: input.upload.kind,
    })
    if (cargoCount >= TRIP_DELIVERY_PROOF_CARGO_LIMIT) throw new TripDeliveryProofCargoLimitError()
  }

  const classified = await classifyUploadPunctuality({ authorship, eventId, input, settings })
  const nextPunctuality = classified.punctuality
  // Só o que substitui funde com o veredito anterior; `cargo` soma, cada foto guarda o seu.
  const punctuality = isCargo
    ? nextPunctuality
    : mergeProofPunctuality({
        next: nextPunctuality,
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

  const thumbnail = await storeThumbnail({ input, eventId })

  const proofId = input.newProofId()
  const receiverDocumentEnvelope =
    receiverDocument.length === 0
      ? null
      : await input.sealDocument({ companyId: input.companyId, proofId, receiverDocument })
  /**
   * Spec 193 D4 (revisa a ADR-0067 §5, emenda 2026-09-18): o nome e quem recebeu vão em qualquer
   * tipo menos a foto da carga — o motorista que só fotografa o canhoto não perde o nome digitado.
   * D5: a configuração da nota decide (`off` descarta); no motorista `required` nunca recusa.
   */
  const carriesReceiverName = input.upload.kind !== TRIP_DELIVERY_PROOF_CARGO_KIND
  const receiver = carriesReceiverName
    ? applyReceivedBySettings({
        channel: authorship.channel,
        mode: settings.receivedBy,
        value: input.upload.receivedBy ?? EMPTY_RECEIVED_BY,
      })
    : EMPTY_RECEIVED_BY

  const proof = await input.repository.saveProof({
    accuracyMeters: input.upload.position?.accuracyMeters?.toFixed(2) ?? null,
    actorUserId: input.actorUserId,
    attachmentKey: input.upload.attachmentKey,
    authorship,
    ...(isCargo ? { cargoLimit: TRIP_DELIVERY_PROOF_CARGO_LIMIT } : {}),
    capturedAt: input.upload.capturedAt ?? null,
    clockOffsetMs: classified.clockOffsetMs,
    companyId: input.companyId,
    eventId,
    id: proofId,
    kind: input.upload.kind,
    lateRegistration: input.upload.lateRegistration ?? false,
    latitude: input.upload.position?.latitude ?? null,
    longitude: input.upload.position?.longitude ?? null,
    mimeType: input.upload.mimeType,
    objectId,
    objectKey,
    punctuality,
    receiverDocumentEnvelope,
    receiverDocumentMasked: receiverDocument.length === 0 ? '' : maskTaxId(receiverDocument),
    receiverName: carriesReceiverName ? input.upload.receiverName : '',
    receivedBy: receiver.receivedBy,
    receivedByDetail: receiver.receivedByDetail,
    sha256: stored.sha256,
    sizeBytes: input.upload.bytes.byteLength,
    ...(thumbnail === undefined ? {} : { thumbnail }),
  })

  return { ...proof, punctuality }
}

function assertThumbnailAccepted(thumbnail: DeliveryProofUpload['thumbnail']): void {
  if (thumbnail === undefined) return
  if (thumbnail.bytes.byteLength > DELIVERY_PROOF_THUMBNAIL_MAX_BYTES) {
    throw new TripDeliveryProofRejectedError('TOO_LARGE')
  }
  if (!isDeliveryProofMimeType(thumbnail.mimeType)) {
    throw new TripDeliveryProofRejectedError('UNSUPPORTED_TYPE')
  }
}

async function storeThumbnail(params: {
  readonly eventId: string
  readonly input: AttachDeliveryProofInput
}): Promise<Parameters<DeliveryProofPort['saveProof']>[0]['thumbnail']> {
  const { input } = params
  const { thumbnail } = input.upload
  if (thumbnail === undefined) return undefined

  const objectId = input.newObjectId()
  const objectKey = buildDeliveryProofObjectKey({
    companyId: input.companyId,
    eventId: params.eventId,
    objectId,
  })
  const stored = await input.storage.store({
    bytes: thumbnail.bytes,
    companyId: input.companyId,
    mimeType: thumbnail.mimeType,
    objectId,
    objectKey,
  })

  return {
    mimeType: thumbnail.mimeType,
    objectId,
    objectKey,
    sha256: stored.sha256,
    sizeBytes: thumbnail.bytes.byteLength,
  }
}

/**
 * ADR-0070 §2-6, spec 159 RF4-RF6, spec 220 RF10: a foto do canhoto e a da mercadoria do motorista
 * entram na nota — a assinatura grava `not_required` de propósito (RF4). Spec 159 T11 (ALTO 2): o
 * envio do escritório (`field-proof`, canal `office`) nunca classifica, e a fusão com a anterior
 * (`mergeProofPunctuality`) preserva o que a foto do motorista já tinha gravado: o canhoto do
 * escritório nem penaliza o motorista nem lava uma foto dele fora da regra.
 */
async function classifyUploadPunctuality(params: {
  readonly authorship: FieldAuthorship
  readonly eventId: string
  readonly input: AttachDeliveryProofInput
  readonly settings: DeliveryProofFieldSettings
}): Promise<ClassifiedUpload> {
  const { kind } = params.input.upload
  const unclassified = { clockOffsetMs: null, punctuality: PROOF_PUNCTUALITY.notRequired }
  if (kind !== PHOTO_PROOF_KIND && kind !== CARGO_PROOF_KIND) return unclassified
  if (params.authorship.channel === TRIP_FIELD_CHANNELS.office) return unclassified

  return classifyPhotoPunctuality(params)
}

/** O veredito e o desvio que o produziu (spec 234 D4) — os dois vão juntos para a linha da foto. */
type ClassifiedUpload = {
  readonly clockOffsetMs: number | null
  readonly punctuality: ProofPunctuality
}

/**
 * RF4-RF6: junta a configuração de pontualidade da empresa com o contexto do evento de entrega
 * (quando e onde aconteceu) e aplica `classifyProofPunctuality`. Só chamada para `kind = 'photo'` ou
 * `'cargo'`; o modo vem da configuração do próprio tipo (`settings.photo` ou `settings.cargo`).
 *
 * Spec 205 D2: registro tardio no envio **ou** na entrega — a app pode esquecer o campo no segundo
 * toque, e a entrega já disse.
 *
 * Spec 234 D4: a foto é julgada pela hora do toque corrigida pelo desvio do relógio; correção
 * descartada por `resolveOccurredAt` mantém a hora crua e o piso de `missingAfterHours`. R1: com
 * posição na entrega, a correção da foto só vale se o evento de entrega também foi corrigido — senão
 * `deliveredAt` é hora crua e a comparação seria entre relógios diferentes. Sem posição (D4b) a flag
 * segue só o desvio. R2: o desvio só vai para a linha da foto quando de fato julgou o veredito.
 */
async function classifyPhotoPunctuality(params: {
  readonly eventId: string
  readonly input: AttachDeliveryProofInput
  readonly settings: DeliveryProofFieldSettings
}): Promise<ClassifiedUpload> {
  const { eventId, input, settings } = params
  const [punctualitySettings, context] = await Promise.all([
    input.repository.resolveProofPunctualitySettings({ companyId: input.companyId }),
    input.repository.findDeliveryContext({ companyId: input.companyId, eventId }),
  ])

  const occurred = resolveOccurredAt({
    clockOffsetMs: input.upload.clockOffsetMs,
    receivedAt: input.now,
    tappedAt: input.upload.capturedAt,
  })

  const hasDeliveryPosition = context.deliveryEventPosition !== undefined
  const hasCorrectedClock =
    occurred.kind === 'corrected' &&
    (!hasDeliveryPosition || context.isEventClockCorrected === true)
  const punctuality = classifyProofPunctuality({
    capturedAt:
      occurred.kind === 'corrected' && hasCorrectedClock
        ? occurred.occurredAt
        : input.upload.capturedAt,
    deliveredAt: context.deliveredAt,
    deliveryEventPosition: context.deliveryEventPosition,
    hasCorrectedClock,
    isDeliveryRecordedByDriver: context.isDeliveryRecordedByDriver,
    lateRegistration: input.upload.lateRegistration === true || context.lateRegistration === true,
    missingAfterHours: punctualitySettings.missingAfterHours,
    photoMode: input.upload.kind === CARGO_PROOF_KIND ? settings.cargo : settings.photo,
    photoPosition: input.upload.position,
    proofRadiusMeters: punctualitySettings.proofRadiusMeters,
    proofWindowMinutes: punctualitySettings.proofWindowMinutes,
    receivedAt: input.now,
  })

  return {
    clockOffsetMs:
      hasCorrectedClock && hasDeliveryPosition ? (input.upload.clockOffsetMs ?? null) : null,
    punctuality,
  }
}
