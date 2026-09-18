/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isRecord, isString } from './tripGuards.validation'

/** Spec 082 (ADR-0057): a configuração é da empresa — o app do campo lê o resolvido no snapshot. */
export const DELIVERY_PROOF_SETTINGS_PATH = '/company-settings/delivery-proof'
export const DELIVERY_PROOF_OVERRIDES_PATH = '/company-settings/delivery-proof/overrides'
/**
 * Spec 156 T13, ADR-0069 §6: o escritório (`trip.report-on-behalf`) lê só o interruptor da leitura
 * do canhoto — a configuração inteira do comprovante é `settings.manage`.
 */
export const FIELD_DELIVERY_SETTINGS_PATH = '/trips/field-delivery-settings'

export type FieldDeliverySettings = Readonly<{ canhotoOcrEnabled: boolean }>

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

/**
 * O merge campo a campo da configuração — a exceção parcial cai no geral. Mora aqui, não como
 * spread inline no componente: quem espalha à mão espalha diferente em cada tela.
 */
export function mergeDeliveryProofSettings(input: {
  readonly base: DeliveryProofFieldSettings
  readonly override: Partial<DeliveryProofFieldSettings>
}): DeliveryProofFieldSettings {
  return {
    photo: input.override.photo ?? input.base.photo,
    receiverDocument: input.override.receiverDocument ?? input.base.receiverDocument,
    receiverName: input.override.receiverName ?? input.base.receiverName,
    signature: input.override.signature ?? input.base.signature,
  }
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

export function isFieldDeliverySettings(value: unknown): value is FieldDeliverySettings {
  return isRecord(value) && typeof value['canhotoOcrEnabled'] === 'boolean'
}

/** Spec 159 RF7, ADR-0070 §7: os cinco parâmetros da nota do motorista, junto do comprovante. */
export const DELIVERY_PROOF_PUNCTUALITY_FIELDS = [
  'proofWindowMinutes',
  'proofRadiusMeters',
  'latePenaltyPoints',
  'missingPenaltyPoints',
  'missingAfterHours',
] as const
export type DeliveryProofPunctualityField = (typeof DELIVERY_PROOF_PUNCTUALITY_FIELDS)[number]

export type DeliveryProofPunctualitySettings = Readonly<
  Record<DeliveryProofPunctualityField, number>
>

/** Faixas do RF7 — fora delas a API recusa com `400 invalidRequest`; o painel valida o mesmo antes. */
export const DELIVERY_PROOF_PUNCTUALITY_RANGES: Readonly<
  Record<DeliveryProofPunctualityField, Readonly<{ max: number; min: number }>>
> = {
  latePenaltyPoints: { max: 100, min: 0 },
  missingAfterHours: { max: 168, min: 1 },
  missingPenaltyPoints: { max: 100, min: 0 },
  proofRadiusMeters: { max: 5000, min: 50 },
  proofWindowMinutes: { max: 1440, min: 5 },
}

/** ADR-0070 §7: os padrões de fábrica — 60 min, 300 m, 5 e 10 pontos, 24 h. */
export const DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS: DeliveryProofPunctualitySettings = {
  latePenaltyPoints: 5,
  missingAfterHours: 24,
  missingPenaltyPoints: 10,
  proofRadiusMeters: 300,
  proofWindowMinutes: 60,
}

/** O corpo do `PUT/GET` geral: os quatro modos + os cinco parâmetros — a exceção por CNPJ não os carrega. */
export type CompanyDeliveryProofSettings = DeliveryProofFieldSettings &
  DeliveryProofPunctualitySettings

export function isDeliveryProofPunctualityValue(
  field: DeliveryProofPunctualityField,
  value: number,
): boolean {
  const range = DELIVERY_PROOF_PUNCTUALITY_RANGES[field]
  return Number.isInteger(value) && value >= range.min && value <= range.max
}

/**
 * Spec 159 (T11, item 7): o campo em branco **nunca** vira `0` silencioso — `Number('')` é `0`, e
 * `latePenaltyPoints`/`missingPenaltyPoints` aceitam `0` como valor válido, então o campo vazio
 * passaria como "zero pontos" sem o motorista ter digitado nada. Vazio vira `NaN`: reprova
 * `Number.isInteger` em `isDeliveryProofPunctualityValue` e aparece com a mensagem de erro do campo.
 */
export function resolvePunctualityFieldValue(input: {
  readonly draftValue: string | undefined
  readonly fallback: number
}): number {
  if (input.draftValue === undefined) return input.fallback
  if (input.draftValue.trim() === '') return Number.NaN
  const parsed = Number(input.draftValue)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export function isDeliveryProofPunctualitySettings(
  value: unknown,
): value is DeliveryProofPunctualitySettings {
  return (
    isRecord(value) &&
    DELIVERY_PROOF_PUNCTUALITY_FIELDS.every(
      (field) =>
        typeof value[field] === 'number' && isDeliveryProofPunctualityValue(field, value[field]),
    )
  )
}

export function isCompanyDeliveryProofSettings(
  value: unknown,
): value is CompanyDeliveryProofSettings {
  return isDeliveryProofFieldSettings(value) && isDeliveryProofPunctualitySettings(value)
}
