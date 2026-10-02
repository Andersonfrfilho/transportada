/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isRecord, isString } from './tripGuards.validation'

/** Spec 082 (ADR-0057): a configuração é da empresa — o app do campo lê o resolvido no snapshot. */
export const DELIVERY_PROOF_SETTINGS_PATH = '/company-settings/delivery-proof'
export const DELIVERY_PROOF_OVERRIDES_PATH = '/company-settings/delivery-proof/overrides'
/** Spec 218 RF-C1/RF-C4: a mesma exceção, agora também por contratante (embarcador/emitente). */
export const DELIVERY_PROOF_CONTRACTOR_OVERRIDES_PATH =
  '/company-settings/delivery-proof-contractor-overrides'
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
  'receivedBy',
] as const
export type DeliveryProofField = (typeof DELIVERY_PROOF_FIELDS)[number]

/** Spec 220 RF06: a mesma faixa do `Zod` da API — fora dela a API recusa com `400`. */
export const DELIVERY_PROOF_CARGO_MINIMUM_COUNT_RANGE = { max: 5, min: 1 } as const

/**
 * Spec 220 RF01/RF06: `cargo` é a foto da mercadoria (separada do canhoto, `photo`) e
 * `cargoMinimumCount` só vale com `cargo` obrigatório — os dois viajam juntos.
 */
export type DeliveryProofFieldSettings = Readonly<
  Record<DeliveryProofField, DeliveryProofFieldMode>
> &
  Readonly<{ cargo: DeliveryProofFieldMode; cargoMinimumCount: number }>

/**
 * Spec 220: como a API anterior responde — `cargo` e o mínimo ainda não existem. Só as guardas o
 * produzem; `normalizeDeliveryProofFieldSettings` o completa antes de chegar a quem consome.
 */
export type DeliveryProofFieldSettingsWire = Omit<
  DeliveryProofFieldSettings,
  'cargo' | 'cargoMinimumCount'
> &
  Readonly<{ cargo?: DeliveryProofFieldMode; cargoMinimumCount?: number }>

export type DeliveryProofSettingsOverride = DeliveryProofFieldSettings & Readonly<{ taxId: string }>

/** Spec 218 RF-C1/RF-C4: o par irmão, por contratante — mesma forma, `contractorId` no lugar do CNPJ. */
export type DeliveryProofSettingsContractorOverride = DeliveryProofFieldSettings &
  Readonly<{ contractorId: string }>

export type DeliveryProofSettingsOverrideWire = DeliveryProofFieldSettingsWire &
  Readonly<{ taxId: string }>
export type DeliveryProofSettingsContractorOverrideWire = DeliveryProofFieldSettingsWire &
  Readonly<{ contractorId: string }>

/** ADR-0057 §4: sem linha gravada vale a fábrica — documento desligado, o resto oferecido. */
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
 * A semente do rascunho de uma exceção nova: o que o operador não tocou parte da geral. É edição,
 * não resolução — a exceção gravada é inteira e vence por inteiro (`resolveDeliveryProofSettings`).
 * Mora aqui, não como spread inline no componente: quem espalha à mão espalha diferente em cada tela.
 */
export function mergeDeliveryProofSettings(input: {
  readonly base: DeliveryProofFieldSettings
  readonly override: Partial<DeliveryProofFieldSettings>
}): DeliveryProofFieldSettings {
  return {
    cargo: input.override.cargo ?? input.base.cargo,
    cargoMinimumCount: input.override.cargoMinimumCount ?? input.base.cargoMinimumCount,
    photo: input.override.photo ?? input.base.photo,
    receivedBy: input.override.receivedBy ?? input.base.receivedBy,
    receiverDocument: input.override.receiverDocument ?? input.base.receiverDocument,
    receiverName: input.override.receiverName ?? input.base.receiverName,
    signature: input.override.signature ?? input.base.signature,
  }
}

/**
 * Spec 218 RF-C3/RF-D1, espelho de `resolveDeliveryProofSettings` da API: destinatário vence
 * contratante vence geral vence fábrica, sempre por inteiro — o mínimo da foto da mercadoria vem
 * da mesma linha que o modo.
 */
export function resolveDeliveryProofSettings(input: {
  readonly contractorOverride: DeliveryProofFieldSettings | undefined
  readonly general: DeliveryProofFieldSettings | undefined
  readonly recipientOverride: DeliveryProofFieldSettings | undefined
}): DeliveryProofFieldSettings {
  return (
    input.recipientOverride ??
    input.contractorOverride ??
    input.general ??
    DEFAULT_DELIVERY_PROOF_SETTINGS
  )
}

/**
 * Bundle da PWA em cache roda contra a API anterior na janela de deploy (e após reversão): sem
 * `cargo` na resposta vale a fábrica — foto da mercadoria desligada, mínimo 1.
 */
export function normalizeDeliveryProofFieldSettings<TWire extends DeliveryProofFieldSettingsWire>(
  value: TWire,
): Omit<TWire, 'cargo' | 'cargoMinimumCount'> &
  Readonly<{ cargo: DeliveryProofFieldMode; cargoMinimumCount: number }> {
  return {
    ...value,
    cargo: value.cargo ?? DEFAULT_DELIVERY_PROOF_SETTINGS.cargo,
    cargoMinimumCount: value.cargoMinimumCount ?? DEFAULT_DELIVERY_PROOF_SETTINGS.cargoMinimumCount,
  }
}

function isFieldMode(value: unknown): value is DeliveryProofFieldMode {
  return DELIVERY_PROOF_FIELD_MODES.some((mode) => mode === value)
}

function isCargoMinimumCount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= DELIVERY_PROOF_CARGO_MINIMUM_COUNT_RANGE.min &&
    value <= DELIVERY_PROOF_CARGO_MINIMUM_COUNT_RANGE.max
  )
}

/**
 * Pedido do usuário (01/10): `receivedBy` passou a ser o quinto campo do painel, igual aos outros
 * quatro — a API sempre o devolve (coluna `NOT NULL` com padrão `optional`), então a validação
 * exige o modo como os demais, sem exceção de ausência. `cargo`/`cargoMinimumCount` continuam
 * opcionais (spec 220): bundle em cache pode rodar contra a API anterior na janela de deploy.
 */
export function isDeliveryProofFieldSettings(
  value: unknown,
): value is DeliveryProofFieldSettingsWire {
  return (
    isRecord(value) &&
    DELIVERY_PROOF_FIELDS.every((field) => isFieldMode(value[field])) &&
    (value['cargo'] === undefined || isFieldMode(value['cargo'])) &&
    (value['cargoMinimumCount'] === undefined || isCargoMinimumCount(value['cargoMinimumCount']))
  )
}

/** Spec 193 D6: sem o campo (API anterior ou linha antiga), quem recebeu é `optional`. */
export function resolveReceivedByMode(
  settings: DeliveryProofFieldSettings & Readonly<{ receivedBy?: DeliveryProofFieldMode }>,
): DeliveryProofFieldMode {
  return settings.receivedBy ?? 'optional'
}

export function isDeliveryProofSettingsOverride(
  value: unknown,
): value is DeliveryProofSettingsOverrideWire {
  return isRecord(value) && isString(value['taxId']) && isDeliveryProofFieldSettings(value)
}

export function isDeliveryProofSettingsContractorOverride(
  value: unknown,
): value is DeliveryProofSettingsContractorOverrideWire {
  return isRecord(value) && isString(value['contractorId']) && isDeliveryProofFieldSettings(value)
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

/**
 * O corpo do `PUT/GET` geral: os cinco modos + os cinco parâmetros + o interruptor da leitura do
 * canhoto (spec 156 T14, ADR-0069 §6) — a exceção por CNPJ não carrega nenhum dos dois.
 */
export type CompanyDeliveryProofSettings = DeliveryProofFieldSettings &
  DeliveryProofPunctualitySettings &
  Readonly<{ canhotoOcrEnabled: boolean }>

export type CompanyDeliveryProofSettingsWire = DeliveryProofFieldSettingsWire &
  DeliveryProofPunctualitySettings &
  Readonly<{ canhotoOcrEnabled: boolean }>

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

/**
 * Spec 156 T14, ADR-0069 §6: o interruptor da leitura do canhoto entra na mesma verificação — a
 * API sempre o devolve junto dos cinco modos e dos cinco parâmetros de pontualidade.
 */
export function isCompanyDeliveryProofSettings(
  value: unknown,
): value is CompanyDeliveryProofSettingsWire {
  return (
    isRecord(value) &&
    typeof value['canhotoOcrEnabled'] === 'boolean' &&
    isDeliveryProofFieldSettings(value) &&
    isDeliveryProofPunctualitySettings(value)
  )
}

/**
 * Pedido do usuário (01/10): "precisamos de poder alterar um registro existente". O `PUT` leva o
 * conjunto inteiro, então editar é substituir **no lugar**: empilhar criaria uma segunda exceção
 * para a mesma chave, e quem resolve pega a primeira que casa — a antiga venceria para sempre, sem
 * nada na tela explicando por quê. `editingKey` ausente é o modo adicionar.
 */
export function upsertDeliveryProofOverride<TOverride>(input: {
  readonly editingKey?: string
  readonly keyOf: (override: TOverride) => string
  readonly override: TOverride
  readonly overrides: readonly TOverride[]
}): readonly TOverride[] {
  if (input.editingKey === undefined) return [...input.overrides, input.override]
  return input.overrides.map((current) =>
    input.keyOf(current) === input.editingKey ? input.override : current,
  )
}
