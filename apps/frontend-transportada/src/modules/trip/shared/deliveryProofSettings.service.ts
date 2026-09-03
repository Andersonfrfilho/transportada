/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isRecord, isString } from './tripGuards.validation'

/** Spec 082 (ADR-0057): a configuração é da empresa — o app do campo lê o resolvido no snapshot. */
export const DELIVERY_PROOF_SETTINGS_PATH = '/company-settings/delivery-proof'
export const DELIVERY_PROOF_OVERRIDES_PATH = '/company-settings/delivery-proof/overrides'

/** Cópia por valor do catálogo da API — o bundle não importa código dela. */
export const DELIVERY_PROOF_FIELD_MODES = ['required', 'optional', 'off'] as const
export type DeliveryProofFieldMode = (typeof DELIVERY_PROOF_FIELD_MODES)[number]

export const DELIVERY_PROOF_FIELDS = [
  'receiverName',
  'receiverDocument',
  'signature',
  'photo',
] as const
export type DeliveryProofField = (typeof DELIVERY_PROOF_FIELDS)[number]

export type DeliveryProofFieldSettings = Readonly<
  Record<DeliveryProofField, DeliveryProofFieldMode>
>

export type DeliveryProofSettingsOverride = DeliveryProofFieldSettings & Readonly<{ taxId: string }>

/** ADR-0057 §4: sem linha gravada vale a fábrica — documento desligado, o resto oferecido. */
export const DEFAULT_DELIVERY_PROOF_SETTINGS: DeliveryProofFieldSettings = {
  photo: 'optional',
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'optional',
}

function isFieldMode(value: unknown): value is DeliveryProofFieldMode {
  return DELIVERY_PROOF_FIELD_MODES.some((mode) => mode === value)
}

export function isDeliveryProofFieldSettings(value: unknown): value is DeliveryProofFieldSettings {
  return isRecord(value) && DELIVERY_PROOF_FIELDS.every((field) => isFieldMode(value[field]))
}

export function isDeliveryProofSettingsOverride(
  value: unknown,
): value is DeliveryProofSettingsOverride {
  return isRecord(value) && isString(value['taxId']) && isDeliveryProofFieldSettings(value)
}
