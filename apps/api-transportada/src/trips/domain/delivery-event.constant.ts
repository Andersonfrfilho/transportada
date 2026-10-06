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
export const RETURNED_EVENT_KIND = 'returned' satisfies TripStopEventKind
export const RETURNED_DOCUMENT_STATUS = 'returned' satisfies TripDocumentSeparationStatus
export const PHOTO_PROOF_KIND = 'photo' satisfies TripDeliveryProofKind
/** Spec 184 RF3/RF4: a foto da mercadoria, opcional, anexada pelo escritório em `field-proof`. */
export const CARGO_PROOF_KIND = 'cargo' satisfies TripDeliveryProofKind
/** Os únicos dois `kind` que o canal `office` aceita em `field-proof` — nunca `signature` (ADR-0067 §5). */
export const OFFICE_PROOF_KINDS = [PHOTO_PROOF_KIND, CARGO_PROOF_KIND] as const
export type OfficeProofKind = (typeof OFFICE_PROOF_KINDS)[number]
export const SIGNATURE_PROOF_KIND = 'signature' satisfies TripDeliveryProofKind
/**
 * Os `kind` que o app do motorista envia em `/me/.../proof`. Lista própria, e não a do banco, para
 * a rota só aceitar o que o motorista de fato manda. Spec 220 RF08: `cargo` entra, com o teto de
 * cinco por entrega cobrado no caso de uso.
 */
export const DRIVER_UPLOAD_PROOF_KINDS = [
  PHOTO_PROOF_KIND,
  SIGNATURE_PROOF_KIND,
  CARGO_PROOF_KIND,
] as const
export type DriverUploadProofKind = (typeof DRIVER_UPLOAD_PROOF_KINDS)[number]
/**
 * Spec 193 D7: as linhas do motorista que carregam quem recebeu (`receivedBy`/`receiverName`).
 * Não é a lista do que ele envia: `cargo` nunca carrega nome nem recebedor.
 */
export const DRIVER_RECEIVER_PROOF_KINDS = [PHOTO_PROOF_KIND, SIGNATURE_PROOF_KIND] as const
export type DriverReceiverProofKind = (typeof DRIVER_RECEIVER_PROOF_KINDS)[number]
/**
 * Spec 184 D3: teto de partida — cobre a avaria sem virar álbum. Spec 220: subir daqui pede
 * migration, o CHECK de `cargo_minimum_count` repete o mesmo 5.
 */
export const TRIP_DELIVERY_PROOF_CARGO_LIMIT = 5
/** A parte da NF-e que recebe a entrega — é o CNPJ dela que resolve a exceção do comprovante. */
export const RECIPIENT_PARTICIPANT_ROLE = 'recipient'
/** O emitente da NF-e é o contratante (ADR-0048 §1) — é o id dele que resolve a exceção do contratante. */
export const EMITTER_PARTICIPANT_ROLE = 'emitter'
/** ADR-0057 §1: o modo do campo do comprovante que a nota do motorista cobra. */
export const REQUIRED_PROOF_FIELD_MODE = 'required' satisfies DeliveryProofFieldMode
/** O modo que oferece o campo sem cobrá-lo (spec 246: a observação da exceção sem foto obrigatória). */
export const OPTIONAL_PROOF_FIELD_MODE = 'optional' satisfies DeliveryProofFieldMode
