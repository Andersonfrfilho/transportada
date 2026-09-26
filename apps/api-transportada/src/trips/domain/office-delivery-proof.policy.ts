/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0067 §5 (D8), spec 156 T15 A2: o que a configuração do comprovante exige do canhoto do
 * escritório. Regra pura — a configuração resolvida chega pronta, e quem grava é o caso de uso.
 */
import { REQUIRED_PROOF_FIELD_MODE } from './delivery-event.constant.js'
import type { DeliveryProofFieldSettings } from './delivery-proof-settings.policy.js'
import {
  TripDeliveryProofDocumentNotAcceptedError,
  TripDeliveryProofPhotoRequiredError,
} from './trip.error.js'
import {
  applyReceivedBySettings,
  EMPTY_RECEIVED_BY,
  type ReceivedByFields,
} from './received-by.policy.js'
import { TRIP_FIELD_CHANNELS } from './trip-field-channel.constant.js'
import { TripDeliveryProofReceiverNameRequiredError } from './trip-field-office.error.js'

export type OfficeProofReceiver = {
  readonly receivedBy?: ReceivedByFields
  readonly receiverDocument: string
  readonly receiverName: string
}

/**
 * Spec 193 D5: quem recebeu no canhoto do escritório — `off` descarta, `required` sem relação é 422
 * `TRIP_DELIVERY_PROOF_RECEIVED_BY_REQUIRED` (o escritório envia síncrono e vê o erro no campo).
 */
export function resolveOfficeReceivedBy(input: {
  readonly receiver: OfficeProofReceiver
  readonly settings: DeliveryProofFieldSettings
}): ReceivedByFields {
  return applyReceivedBySettings({
    channel: TRIP_FIELD_CHANNELS.office,
    mode: input.settings.receivedBy,
    value: input.receiver.receivedBy ?? EMPTY_RECEIVED_BY,
  })
}

/**
 * Foto obrigatória **ou** assinatura obrigatória sem foto é 422 `PHOTO_REQUIRED`: o escritório
 * cumpre a assinatura com a foto do canhoto assinado. Assinatura obrigatória sem nome é 422
 * `RECEIVER_NAME_REQUIRED`. Documento do recebedor com a configuração `off` é recusado, como no
 * motorista (ADR-0057 §1).
 */
export function assertOfficeProofMeetsSettings(input: {
  readonly receiver: OfficeProofReceiver | null
  readonly settings: DeliveryProofFieldSettings
}): void {
  const { receiver, settings } = input
  const isSignatureRequired = settings.signature === REQUIRED_PROOF_FIELD_MODE

  if (receiver === null) {
    if (settings.photo === REQUIRED_PROOF_FIELD_MODE || isSignatureRequired) {
      throw new TripDeliveryProofPhotoRequiredError()
    }
    return
  }

  if (isSignatureRequired && receiver.receiverName.trim().length === 0) {
    throw new TripDeliveryProofReceiverNameRequiredError()
  }
  if (receiver.receiverDocument.length > 0 && settings.receiverDocument === 'off') {
    throw new TripDeliveryProofDocumentNotAcceptedError()
  }
}
