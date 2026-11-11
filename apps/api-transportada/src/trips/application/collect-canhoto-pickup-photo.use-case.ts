/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 T4 (D4b, CA04): o motorista da viagem da coleta manda a foto do canhoto retido.
 *
 * A foto **é o canhoto da entrega de origem**: vai pelo mesmo `attachDeliveryProof` de sempre, para o evento de entrega da
 * nota na viagem de origem (`canhotoPickup`), e daí em diante segue o caminho de qualquer canhoto — o worker lê, a
 * conferência decide, e o veredito fecha ou reabre a coleta (`settleCanhotoPickupOnReview`). Aqui só se confere que a
 * coleta é do motorista (BOLA: a coleta `scheduled` numa viagem em que ele está na tripulação; o resto é 404) e, depois
 * da foto gravada, se marca a coleta como fotografada e se fecha a parada só de coleta.
 */
import { PHOTO_PROOF_KIND } from '../domain/delivery-event.constant.js'
import {
  CanhotoPickupNotFoundError,
  CanhotoPickupProofKindError,
} from '../domain/canhoto-pickup.error.js'
import type { TripFieldChannel } from '../domain/trip-field-channel.constant.js'
import type {
  AttachedDeliveryProof,
  DeliveryProofUpload,
} from './attach-delivery-proof.use-case.js'
import type { FieldAuthorship } from './field-trip-target.types.js'

export type DriverCanhotoPickupTarget = {
  readonly id: string
  readonly originTripDocumentId: string
  readonly originTripId: string
  readonly pickupStopId: null | string
  readonly pickupTripId: string
}

export type CanhotoPickupCollectionPort = {
  /** `null` quando a coleta não existe, é de outra empresa, não está encaixada ou o motorista não está na viagem dela. */
  findDriverPickup(input: {
    readonly companyId: string
    readonly driverId: string
    readonly pickupId: string
  }): Promise<DriverCanhotoPickupTarget | null>
  recordPhotoSent(input: {
    readonly actorUserId: string
    readonly at: Date
    readonly authorship: FieldAuthorship
    readonly companyId: string
    readonly pickupId: string
  }): Promise<{ readonly stopClosed: boolean; readonly tripCompleted: boolean }>
}

export type CollectCanhotoPickupPhotoInput = {
  readonly actorUserId: string
  /** A gravação da foto como canhoto da nota de origem: `attachDeliveryProof` com `canhotoPickup`, montado na composição. */
  readonly attach: (input: {
    readonly channel: TripFieldChannel
    readonly documentId: string
    readonly driverId: string
    readonly originTripId: string
    readonly upload: DeliveryProofUpload
  }) => Promise<AttachedDeliveryProof>
  readonly channel: TripFieldChannel
  readonly collection: CanhotoPickupCollectionPort
  readonly companyId: string
  readonly driverId: string
  readonly now: Date
  readonly pickupId: string
  readonly upload: DeliveryProofUpload
}

export type CollectedCanhotoPickupPhoto = {
  readonly documentId: string
  readonly proof: AttachedDeliveryProof
  readonly stopClosed: boolean
  readonly tripCompleted: boolean
}

export async function collectCanhotoPickupPhoto(
  input: CollectCanhotoPickupPhotoInput,
): Promise<CollectedCanhotoPickupPhoto> {
  if (input.upload.kind !== PHOTO_PROOF_KIND) throw new CanhotoPickupProofKindError()
  const pickup = await input.collection.findDriverPickup({
    companyId: input.companyId,
    driverId: input.driverId,
    pickupId: input.pickupId,
  })
  if (pickup === null) throw new CanhotoPickupNotFoundError()

  const proof = await input.attach({
    channel: input.channel,
    documentId: pickup.originTripDocumentId,
    driverId: input.driverId,
    originTripId: pickup.originTripId,
    upload: input.upload,
  })
  // A mesma imagem que já é canhoto desta nota conta como enviada (reenvio); de outra nota, não.
  if (proof.duplicate !== undefined && proof.duplicate.documentId !== pickup.originTripDocumentId) {
    return {
      documentId: pickup.originTripDocumentId,
      proof,
      stopClosed: false,
      tripCompleted: false,
    }
  }
  const settled = await input.collection.recordPhotoSent({
    actorUserId: input.actorUserId,
    at: input.now,
    authorship: { channel: input.channel, onBehalfOfDriverId: null },
    companyId: input.companyId,
    pickupId: pickup.id,
  })
  return { documentId: pickup.originTripDocumentId, proof, ...settled }
}
