/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  DELIVERY_PROOF_FIELD_MODES,
  type DeliveryProofFieldMode,
} from '../../database/company-delivery-proof-settings.schema.js'

export { DELIVERY_PROOF_FIELD_MODES }
export type { DeliveryProofFieldMode }

/** ADR-0057 §1: os quatro campos do comprovante que o painel governa. */
export type DeliveryProofFieldSettings = {
  readonly photo: DeliveryProofFieldMode
  readonly receiverDocument: DeliveryProofFieldMode
  readonly receiverName: DeliveryProofFieldMode
  readonly signature: DeliveryProofFieldMode
}

/** ADR-0057 §4: o padrão de fábrica é a ADR-0045 — documento desligado, o resto oferecido. */
export const DEFAULT_DELIVERY_PROOF_SETTINGS: DeliveryProofFieldSettings = {
  photo: 'optional',
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'optional',
}

export type ResolveDeliveryProofSettingsParams = {
  readonly general: DeliveryProofFieldSettings | null
  readonly override: DeliveryProofFieldSettings | null
}

/**
 * A exceção por CNPJ do destinatário vence a geral **por inteiro** — meia-exceção obrigaria o
 * operador a raciocinar campo a campo sobre duas telas. Sem linha nenhuma vale a fábrica.
 */
export function resolveDeliveryProofSettings(
  params: ResolveDeliveryProofSettingsParams,
): DeliveryProofFieldSettings {
  return params.override ?? params.general ?? DEFAULT_DELIVERY_PROOF_SETTINGS
}

/**
 * ADR-0057 §3: toda leitura devolve o documento assim — visíveis só os dígitos 4 a 9 do CPF
 * (`***.938.570-**`) ou o miolo do CNPJ. Valor fora de forma sai todo mascarado, nunca em claro.
 */
export function maskTaxId(value: string): string {
  if (/^[0-9]{11}$/u.test(value)) {
    return `***.${value.slice(3, 6)}.${value.slice(6, 9)}-**`
  }
  if (/^[A-Z0-9]{12}[0-9]{2}$/u.test(value)) {
    return `**.***.${value.slice(6, 9)}/****-**`
  }

  return '*'.repeat(value.length)
}
