/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 159 T11 (§16): os literais que a entrega, a foto e a nota do motorista repetiam em cada
 * consulta. Tipados pelos catálogos do schema — um erro de digitação não compila.
 */
import type { DeliveryProofFieldMode } from '../../database/company-delivery-proof-settings.schema.js'
import type {
  TripDeliveryProofKind,
  TripDocumentSeparationStatus,
  TripStopEventKind,
} from '../../database/trip.schema.js'

export const DELIVERED_EVENT_KIND = 'delivered' satisfies TripStopEventKind
export const DELIVERED_DOCUMENT_STATUS = 'delivered' satisfies TripDocumentSeparationStatus
export const PHOTO_PROOF_KIND = 'photo' satisfies TripDeliveryProofKind
/** A parte da NF-e que recebe a entrega — é o CNPJ dela que resolve a exceção do comprovante. */
export const RECIPIENT_PARTICIPANT_ROLE = 'recipient'
/** ADR-0057 §1: o modo do campo do comprovante que a nota do motorista cobra. */
export const REQUIRED_PROOF_FIELD_MODE = 'required' satisfies DeliveryProofFieldMode
