/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 T4 (D4b): a foto do canhoto retido mandada pelo WhatsApp vai pelo **mesmo** caso de uso da rota do app
 * (`collectCanhotoPickupPhoto`), no canal `whatsapp`: vira o canhoto da entrega de origem, marca a coleta como
 * fotografada e fecha a parada só de coleta. Nada de log aqui além do que o comprovante já faz.
 */
import type { NfeStorageGateway } from '../../storage/infrastructure/nfe-storage-gateway.js'
import type { ApiLogger } from '../../shared/api.types.js'
import {
  attachDeliveryProof,
  type DeliveryProofPort,
} from '../../trips/application/attach-delivery-proof.use-case.js'
import {
  collectCanhotoPickupPhoto,
  type CanhotoPickupCollectionPort,
} from '../../trips/application/collect-canhoto-pickup-photo.use-case.js'
import { PHOTO_PROOF_KIND } from '../../trips/domain/delivery-event.constant.js'
import { TRIP_FIELD_CHANNELS } from '../../trips/domain/trip-field-channel.constant.js'
import { createDeliveryProofStorage } from '../../trips/infrastructure/delivery-proof-storage.gateway.js'
import type { WhatsAppCanhotoRecognitionPorts } from '../application/whatsapp-canhoto-recognition.service.js'

export function createWhatsAppCanhotoPickupPort(deps: {
  readonly bucket: string
  readonly collection: CanhotoPickupCollectionPort & {
    readonly listScheduled: NonNullable<WhatsAppCanhotoRecognitionPorts['canhotoPickups']>['list']
  }
  readonly logger: ApiLogger
  readonly repository: DeliveryProofPort
  readonly storage: NfeStorageGateway
}): NonNullable<WhatsAppCanhotoRecognitionPorts['canhotoPickups']> {
  const storage = createDeliveryProofStorage({ bucket: deps.bucket, storage: deps.storage })
  return {
    async collect(input) {
      await collectCanhotoPickupPhoto({
        actorUserId: input.actor.actorUserId,
        attach: (attach) =>
          attachDeliveryProof({
            actorUserId: input.actor.actorUserId,
            canhotoPickup: { originTripId: attach.originTripId },
            channel: TRIP_FIELD_CHANNELS.whatsapp,
            companyId: input.actor.companyId,
            documentId: attach.documentId,
            driverId: attach.driverId,
            logger: deps.logger,
            newObjectId: () => crypto.randomUUID(),
            newProofId: () => crypto.randomUUID(),
            now: new Date(),
            repository: deps.repository,
            sealDocument: () =>
              Promise.reject(new Error('whatsapp proofs carry no receiver document')),
            storage,
            upload: attach.upload,
          }),
        channel: TRIP_FIELD_CHANNELS.whatsapp,
        collection: deps.collection,
        companyId: input.actor.companyId,
        driverId: input.actor.driverId,
        now: new Date(),
        pickupId: input.pickupId,
        upload: {
          attachmentKey: `whatsapp-canhoto-pickup:${input.providerMessageId}`,
          bytes: input.bytes,
          capturedAt: undefined,
          kind: PHOTO_PROOF_KIND,
          mimeType: input.mimeType,
          position: undefined,
          receiverDocument: '',
          receiverName: '',
          variant: 'original',
        },
      })
    },
    list: (input) => deps.collection.listScheduled(input),
  }
}
