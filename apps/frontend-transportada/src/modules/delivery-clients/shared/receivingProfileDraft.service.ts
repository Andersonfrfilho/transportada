/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  PREVIEW_ITEM_FIELDS,
  RECEIVING_PROFILE_DEFAULT_MATCH_WINDOW_DAYS,
  RECEIVING_PROFILE_DEFAULT_WEIGHT_TOLERANCE_PERCENT,
  type PreviewColumnMap,
  type PreviewItemField,
  type ReceivingProfile,
  type ReceivingProfileRules,
} from './receivingProfile.types'

/** O formulário trabalha com texto: campo em branco é "sem regra", e só a hora de gravar vira número ou null. */
export type ReceivingProfileDraft = Readonly<{
  arrivalReferencePattern: string
  deliveryDeadlineBusinessDays: string
  isEnabled: boolean
  matchWindowDays: string
  previewColumnMap: Readonly<Record<PreviewItemField, string>>
  previewEnabled: boolean
  previewSheetName: string
  requiresDamageCheck: boolean
  separationWindowHours: string
  weightTolerancePercent: string
}>

const DECIMAL_COMMA = ','
const DECIMAL_POINT = '.'

function optionalNumberText(value: number | null): string {
  return value === null ? '' : String(value)
}

function emptyColumnMap(): Record<PreviewItemField, string> {
  return Object.fromEntries(PREVIEW_ITEM_FIELDS.map((field) => [field, ''])) as Record<
    PreviewItemField,
    string
  >
}

function columnMapDraft(map: PreviewColumnMap | null): Record<PreviewItemField, string> {
  const draft = emptyColumnMap()
  for (const field of PREVIEW_ITEM_FIELDS) draft[field] = map?.[field] ?? ''
  return draft
}

/** Contratante sem perfil abre com os padrões do algoritmo; ligar o recebimento é decisão da pessoa. */
export function createReceivingProfileDraft(
  profile: ReceivingProfile | null,
): ReceivingProfileDraft {
  return {
    arrivalReferencePattern: profile?.arrivalReferencePattern ?? '',
    deliveryDeadlineBusinessDays: optionalNumberText(profile?.deliveryDeadlineBusinessDays ?? null),
    isEnabled: profile?.isEnabled ?? false,
    matchWindowDays: String(
      profile?.matchWindowDays ?? RECEIVING_PROFILE_DEFAULT_MATCH_WINDOW_DAYS,
    ),
    previewColumnMap: columnMapDraft(profile?.previewColumnMap ?? null),
    previewEnabled: profile?.previewEnabled ?? false,
    previewSheetName: profile?.previewSheetName ?? '',
    requiresDamageCheck: profile?.requiresDamageCheck ?? false,
    separationWindowHours: optionalNumberText(profile?.separationWindowHours ?? null),
    weightTolerancePercent: String(
      profile?.weightTolerancePercent ?? RECEIVING_PROFILE_DEFAULT_WEIGHT_TOLERANCE_PERCENT,
    ).replace(DECIMAL_POINT, DECIMAL_COMMA),
  }
}

function toOptionalText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function toOptionalNumber(value: string): number | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : Number(trimmed)
}

function toColumnMap(draft: ReceivingProfileDraft): PreviewColumnMap | null {
  const entries = PREVIEW_ITEM_FIELDS.flatMap((field) => {
    const columnName = draft.previewColumnMap[field].trim()
    return columnName === '' ? [] : [[field, columnName] as const]
  })
  return entries.length === 0 ? null : Object.fromEntries(entries)
}

/** As 10 chaves, sempre: campo omitido o servidor recusa, e `null` é o jeito de dizer "sem regra". */
export function toReceivingProfileRules(draft: ReceivingProfileDraft): ReceivingProfileRules {
  return {
    arrivalReferencePattern: toOptionalText(draft.arrivalReferencePattern),
    deliveryDeadlineBusinessDays: toOptionalNumber(draft.deliveryDeadlineBusinessDays),
    isEnabled: draft.isEnabled,
    matchWindowDays: Number(draft.matchWindowDays.trim()),
    previewColumnMap: toColumnMap(draft),
    previewEnabled: draft.previewEnabled,
    previewSheetName: toOptionalText(draft.previewSheetName),
    requiresDamageCheck: draft.requiresDamageCheck,
    separationWindowHours: toOptionalNumber(draft.separationWindowHours),
    weightTolerancePercent: Number(
      draft.weightTolerancePercent.trim().replace(DECIMAL_COMMA, DECIMAL_POINT),
    ),
  }
}
