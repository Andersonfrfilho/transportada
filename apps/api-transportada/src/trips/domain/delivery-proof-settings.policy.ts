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

/**
 * ADR-0069 §6: a leitura do canhoto pela foto é experimental, desligada por padrão — sem linha
 * gravada vale isto. O interruptor é da empresa, não entra na exceção por destinatário nem no
 * snapshot do motorista.
 */
export const DEFAULT_CANHOTO_OCR_ENABLED = false

/**
 * ADR-0070 §3-5, spec 159 RF7: os parâmetros da nota do motorista. Só existem na configuração
 * **geral** da empresa — a exceção por CNPJ (`deliveryProofSettingOverrides`) continua só com os
 * quatro campos de `DeliveryProofFieldSettings`, porque a regra da nota é da empresa, não do
 * destinatário.
 */
export type DeliveryProofPunctualitySettings = {
  readonly proofWindowMinutes: number
  readonly proofRadiusMeters: number
  readonly latePenaltyPoints: number
  readonly missingPenaltyPoints: number
  readonly missingAfterHours: number
}

/** ADR-0070 §5: os números escolhidos na conversa da spec — configuráveis por empresa. */
export const DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS: DeliveryProofPunctualitySettings = {
  latePenaltyPoints: 5,
  missingAfterHours: 24,
  missingPenaltyPoints: 10,
  proofRadiusMeters: 300,
  proofWindowMinutes: 60,
}

/**
 * A configuração geral do comprovante: os quatro modos, os parâmetros de pontualidade e o
 * interruptor da leitura do canhoto (ADR-0069 §6).
 */
export type CompanyDeliveryProofSettings = DeliveryProofFieldSettings &
  DeliveryProofPunctualitySettings & {
    readonly canhotoOcrEnabled: boolean
  }

/** No `PUT`, o interruptor ausente é "não mexe": o painel de antes da T13 manda só os campos. */
export type DeliveryProofSettingsInput = DeliveryProofFieldSettings &
  DeliveryProofPunctualitySettings & {
    readonly canhotoOcrEnabled?: boolean
  }

export const DEFAULT_COMPANY_DELIVERY_PROOF_SETTINGS: CompanyDeliveryProofSettings = {
  ...DEFAULT_DELIVERY_PROOF_SETTINGS,
  ...DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS,
  canhotoOcrEnabled: DEFAULT_CANHOTO_OCR_ENABLED,
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

export type ProofSettingsLookup = {
  readonly general: DeliveryProofFieldSettings | null
  readonly overridesByTaxId: ReadonlyMap<string, DeliveryProofFieldSettings>
}

export type ResolveProofSettingsForRecipientParams = {
  readonly lookup: ProofSettingsLookup
  readonly recipientTaxId: string
}

/**
 * Spec 082 (revisão): a exceção casa pelo CNPJ do destinatário **do documento**, nunca da parada —
 * a parada agrupa por endereço e pode ter mais de um destinatário. Esta é a regra única dos dois
 * caminhos: o snapshot do motorista e a escrita do comprovante leem daqui, senão divergem calados.
 */
export function resolveProofSettingsForRecipient(
  params: ResolveProofSettingsForRecipientParams,
): DeliveryProofFieldSettings {
  const override =
    params.recipientTaxId.length === 0
      ? null
      : (params.lookup.overridesByTaxId.get(params.recipientTaxId) ?? null)

  return resolveDeliveryProofSettings({ general: params.lookup.general, override })
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
