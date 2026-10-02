/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  DELIVERY_PROOF_FIELD_MODES,
  type DeliveryProofFieldMode,
} from '../../database/company-delivery-proof-settings.schema.js'
import { resolveWithOverrides } from '../../shared/resolve-with-overrides.policy.js'

export { DELIVERY_PROOF_FIELD_MODES }
export type { DeliveryProofFieldMode }

/**
 * ADR-0057 §1: os campos do comprovante que o painel governa. Spec 193 D6: `receivedBy` (quem
 * recebeu, em relação ao destinatário) é o quinto.
 */
export type DeliveryProofFieldSettings = {
  /** Spec 220 RF01: a foto da mercadoria, separada do canhoto (`photo`). */
  readonly cargo: DeliveryProofFieldMode
  /** Spec 220 RF06: quantas fotos da mercadoria, lido só quando `cargo` é `required`. */
  readonly cargoMinimumCount: number
  readonly photo: DeliveryProofFieldMode
  readonly receivedBy: DeliveryProofFieldMode
  readonly receiverDocument: DeliveryProofFieldMode
  readonly receiverName: DeliveryProofFieldMode
  readonly signature: DeliveryProofFieldMode
}

/**
 * Spec 193 D6: no `PUT`, `receivedBy` ausente é "não mexe" — o painel anterior ao campo manda só
 * os quatro modos. Na geral preserva o gravado; na exceção, o do mesmo `taxId` (senão `optional`).
 */
export type DeliveryProofFieldSettingsInput = Omit<
  DeliveryProofFieldSettings,
  'cargo' | 'cargoMinimumCount' | 'receivedBy'
> & {
  readonly cargo?: DeliveryProofFieldMode
  readonly cargoMinimumCount?: number
  readonly receivedBy?: DeliveryProofFieldMode
}

/** ADR-0057 §4: o padrão de fábrica é a ADR-0045 — documento desligado, o resto oferecido. */
export const DEFAULT_DELIVERY_PROOF_SETTINGS: DeliveryProofFieldSettings = {
  cargo: 'off',
  cargoMinimumCount: 1,
  photo: 'optional',
  receivedBy: 'optional',
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'optional',
}

/**
 * Spec 223 RF3: a configuração exige canhoto quando a foto **ou** a assinatura é `required`.
 * Regra única da escrita (`resolveProofPendingFlag`) e da leitura (`proof-pending.query.ts`).
 */
export function isProofRequiredBySettings(
  settings: Pick<DeliveryProofFieldSettings, 'photo' | 'signature'> | undefined,
): boolean {
  return settings?.photo === 'required' || settings?.signature === 'required'
}

/** Spec 220 RF06: com `cargo` opcional ou desligado não há mínimo a cobrar. */
export function readCargoRequiredCount(
  settings: Pick<DeliveryProofFieldSettings, 'cargo' | 'cargoMinimumCount'>,
): number {
  return settings.cargo === 'required' ? settings.cargoMinimumCount : 0
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
export type DeliveryProofSettingsInput = DeliveryProofFieldSettingsInput &
  DeliveryProofPunctualitySettings & {
    readonly canhotoOcrEnabled?: boolean
  }

export const DEFAULT_COMPANY_DELIVERY_PROOF_SETTINGS: CompanyDeliveryProofSettings = {
  ...DEFAULT_DELIVERY_PROOF_SETTINGS,
  ...DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS,
  canhotoOcrEnabled: DEFAULT_CANHOTO_OCR_ENABLED,
}

/**
 * Spec 218 RF-C3: três camadas — a exceção do destinatário vence a do contratante, que vence a
 * geral, que vence a fábrica. `contractorOverride` é opcional: os dois call sites que ainda não
 * sabem resolver contratante (nota do motorista/escrita do comprovante fora do escopo da 218)
 * seguem chamando com `contractorOverride: null` e o comportamento de duas camadas é preservado.
 */
export type ResolveDeliveryProofSettingsParams = {
  readonly general: DeliveryProofFieldSettings | null
  readonly contractorOverride: DeliveryProofFieldSettings | null
  readonly recipientOverride: DeliveryProofFieldSettings | null
}

/**
 * A exceção mais específica vence a geral **por inteiro** — meia-exceção obrigaria o operador a
 * raciocinar campo a campo sobre três telas. Sem linha nenhuma vale a fábrica.
 */
export function resolveDeliveryProofSettings(
  params: ResolveDeliveryProofSettingsParams,
): DeliveryProofFieldSettings {
  return resolveWithOverrides({
    contractorOverride: params.contractorOverride,
    fallback: DEFAULT_DELIVERY_PROOF_SETTINGS,
    general: params.general,
    recipientOverride: params.recipientOverride,
  })
}

export type ProofSettingsLookup = {
  readonly general: DeliveryProofFieldSettings | null
  readonly overridesByTaxId: ReadonlyMap<string, DeliveryProofFieldSettings>
  /** Spec 218 RF-C3: a exceção por contratante (embarcador/emitente), chaveada por `contractors.id`. */
  readonly overridesByContractorId?: ReadonlyMap<string, DeliveryProofFieldSettings>
}

export type ResolveProofSettingsForRecipientParams = {
  readonly lookup: ProofSettingsLookup
  readonly recipientTaxId: string
  /** Spec 218: ausente (chamador de duas camadas) é "sem contratante resolvido" — cai na geral. */
  readonly contractorId?: string | null
}

/**
 * Spec 082 (revisão): a exceção do destinatário casa pelo CNPJ **do documento**, nunca da parada —
 * a parada agrupa por endereço e pode ter mais de um destinatário. Spec 218: a exceção do
 * contratante casa pelo `contractors.id` resolvido do emitente da mesma nota, e o destinatário
 * vence quando as duas se aplicam (P4 do spec.md). Esta é a regra única dos caminhos que já
 * resolvem contratante e dos que ainda não resolvem — os dois leem daqui, senão divergem calados.
 */
export function resolveProofSettingsForRecipient(
  params: ResolveProofSettingsForRecipientParams,
): DeliveryProofFieldSettings {
  const recipientOverride =
    params.recipientTaxId.length === 0
      ? null
      : (params.lookup.overridesByTaxId.get(params.recipientTaxId) ?? null)
  const contractorId = params.contractorId ?? null
  const contractorOverride =
    contractorId === null
      ? null
      : (params.lookup.overridesByContractorId?.get(contractorId) ?? null)

  return resolveDeliveryProofSettings({
    contractorOverride,
    general: params.lookup.general,
    recipientOverride,
  })
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
