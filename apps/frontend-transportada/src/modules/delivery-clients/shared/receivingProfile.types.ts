/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * ADR-0094 §2 (spec 237): o perfil de recebimento do contratante. ⚠️ Cópia por valor do que a API
 * devolve e das faixas que ela aplica — o bundle não carrega código de lá, e mudar uma faixa lá
 * obriga a mudar aqui.
 */

/** Os campos de item que a prévia sabe ler — o mapa só aponta uma coluna da planilha para um deles. */
export const PREVIEW_ITEM_FIELDS = [
  'contractorReference',
  'recipientCode',
  'recipientName',
  'weightKg',
  'volumeM3',
  'value',
  'address',
  'neighborhood',
  'city',
  'state',
  'postalCode',
  'routeName',
  'routingDate',
] as const
export type PreviewItemField = (typeof PREVIEW_ITEM_FIELDS)[number]

/** O mínimo do vínculo por conteúdo (RF5a): roteiro, valor e peso. */
export const PREVIEW_REQUIRED_FIELDS: readonly PreviewItemField[] = [
  'routeName',
  'value',
  'weightKg',
]

export type PreviewColumnMap = Readonly<Partial<Record<PreviewItemField, string>>>

export type ReceivingProfileRules = Readonly<{
  /** O texto literal antes do número da carga no `infCpl`, nunca expressão regular. */
  arrivalReferenceLabel: string | null
  deliveryDeadlineBusinessDays: number | null
  isEnabled: boolean
  matchWindowDays: number
  previewColumnMap: PreviewColumnMap | null
  previewEnabled: boolean
  previewSheetName: string | null
  requiresDamageCheck: boolean
  separationWindowHours: number | null
  weightTolerancePercent: number
}>

export type ReceivingProfile = ReceivingProfileRules &
  Readonly<{
    contractorId: string
    updatedAt: string
  }>

/** O resumo que a lista de perfis traz por contratante: dá o selo da lista sem abrir cada ficha. */
export type ReceivingProfileListItem = Readonly<{
  contractorId: string
  isEnabled: boolean
  previewEnabled: boolean
}>

export const RECEIVING_PROFILE_LIST_ITEM_KEYS = [
  'contractorId',
  'isEnabled',
  'previewEnabled',
] as const

export const RECEIVING_PROFILE_RULE_KEYS = [
  'arrivalReferenceLabel',
  'deliveryDeadlineBusinessDays',
  'isEnabled',
  'matchWindowDays',
  'previewColumnMap',
  'previewEnabled',
  'previewSheetName',
  'requiresDamageCheck',
  'separationWindowHours',
  'weightTolerancePercent',
] as const

export const RECEIVING_PROFILE_KEYS = [
  ...RECEIVING_PROFILE_RULE_KEYS,
  'contractorId',
  'updatedAt',
] as const

export const RECEIVING_PROFILE_LIMITS = {
  arrivalReferenceLabelMaxLength: 60,
  deliveryDeadlineBusinessDays: { max: 60, min: 1 },
  matchWindowDays: { max: 60, min: 1 },
  previewColumnNameMaxLength: 80,
  previewSheetNameMaxLength: 31,
  separationWindowHours: { max: 168, min: 1 },
  weightTolerancePercent: { max: 100, min: 0 },
} as const

/** Os padrões de um perfil que ainda não existe: ligar a prévia e o recebimento é decisão da pessoa. */
export const RECEIVING_PROFILE_DEFAULT_MATCH_WINDOW_DAYS = 15
export const RECEIVING_PROFILE_DEFAULT_WEIGHT_TOLERANCE_PERCENT = 0

export const RECEIVING_PROFILE_LIST_PATH = '/contractor-receiving-profiles'

export function buildReceivingProfilePath(contractorId: string): string {
  return `/contractors/${contractorId}/receiving-profile`
}
