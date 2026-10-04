/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF1 (ADR-0094 §2): as faixas do perfil de recebimento. O banco repete as mesmas em
 * CHECK; aqui elas viram mensagem de campo antes de chegar lá.
 */

/** Os campos de item que a prévia sabe ler — o mapa só aponta coluna para um deles. */
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

export const RECEIVING_PROFILE_LIMITS = {
  arrivalReferencePatternMaxLength: 200,
  deliveryDeadlineBusinessDays: { max: 60, min: 1 },
  matchWindowDays: { max: 60, min: 1 },
  previewColumnNameMaxLength: 80,
  previewSheetNameMaxLength: 31,
  separationWindowHours: { max: 168, min: 1 },
  weightTolerancePercent: { max: 100, min: 0 },
} as const
