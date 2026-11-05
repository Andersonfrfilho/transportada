/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T15: as provas da entrega em preparo viram comprovante pelo **mesmo** `attachDeliveryProof` do
 * app, no canal `whatsapp`. Mora fora do `main.ts` porque cita quem recebeu: o contrato da spec 193 CA11
 * proíbe log em arquivo que menciona o detalhe, e aqui não há log nenhum (o do comprovante é o do caso de
 * uso, que nunca leva quem recebeu).
 */
import type { NfeStorageGateway } from '../../storage/infrastructure/nfe-storage-gateway.js'
import type { ApiLogger } from '../../shared/api.types.js'
import {
  attachDeliveryProof,
  type DeliveryProofPort,
} from '../../trips/application/attach-delivery-proof.use-case.js'
import { TRIP_FIELD_CHANNELS } from '../../trips/domain/trip-field-channel.constant.js'
import { createDeliveryProofStorage } from '../../trips/infrastructure/delivery-proof-storage.gateway.js'
import type { WhatsAppDeliveryPreparationPorts } from '../application/whatsapp-delivery-preparation.service.js'

export function createWhatsAppPreparationProofAttacher(deps: {
  readonly bucket: string
  readonly logger: ApiLogger
  readonly repository: DeliveryProofPort
  readonly storage: NfeStorageGateway
}): WhatsAppDeliveryPreparationPorts['attachProof'] {
  const storage = createDeliveryProofStorage({ bucket: deps.bucket, storage: deps.storage })
  return (input) =>
    attachDeliveryProof({
      actorUserId: input.actorUserId,
      channel: TRIP_FIELD_CHANNELS.whatsapp,
      companyId: input.companyId,
      documentId: input.documentId,
      driverId: input.driverId,
      logger: deps.logger,
      newObjectId: () => crypto.randomUUID(),
      newProofId: () => crypto.randomUUID(),
      now: new Date(),
      repository: deps.repository,
      // O WhatsApp não colhe o documento de quem recebeu (só vai com a assinatura, que é do app).
      sealDocument: () => Promise.reject(new Error('whatsapp proofs carry no receiver document')),
      storage,
      upload: {
        attachmentKey: input.upload.attachmentKey,
        bytes: input.upload.bytes,
        capturedAt: undefined,
        kind: input.upload.kind,
        mimeType: input.upload.mimeType,
        position: undefined,
        receiverDocument: '',
        receivedBy: { receivedBy: input.upload.receivedBy, receivedByDetail: null },
        receiverName: input.upload.receiverName,
        ...(input.upload.replaceCanhoto === true ? { replaceCanhoto: true } : {}),
        variant: 'original',
      },
    })
}
