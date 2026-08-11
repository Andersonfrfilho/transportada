/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  CteBatchGroupingMode,
  CteBatchPreview,
  CteBatchPreviewBlock,
  CteBatchPreviewRequest,
} from '@/modules/cte-batch/shared/cteBatchPreview.types'

export type CteEmissionGroupingMode = CteBatchGroupingMode
export type CteEmissionPreview = CteBatchPreview

export const AUTOMATIC_PROFILE_ID = 'auto'

export const CTE_EMISSION_PREVIEW_QUERY_KEY = 'cte-emission-preview'

const BATCH_NAME_TAKEN_CODE = 'CTE_BATCH_NAME_TAKEN'
const DOCUMENT_ALREADY_LINKED_CODE = 'CTE_BATCH_DOCUMENT_ALREADY_LINKED'

const CREATE_ERROR_MESSAGE_KEYS: Readonly<Record<string, string>> = {
  [BATCH_NAME_TAKEN_CODE]: 'cteEmission.errorNameTaken',
  [DOCUMENT_ALREADY_LINKED_CODE]: 'cteEmission.errorAlreadyLinked',
}

/**
 * Espelha `CTE_BATCH_MAX_DOCUMENTS` da API: é o teto **por requisição**, não o teto da seleção. A
 * emissão em massa fatia a seleção abaixo desse número e emite fatia por fatia, então `per_invoice`
 * não tem teto. Só `sender_recipient` esbarra aqui, porque fatiar separaria notas do mesmo par
 * remetente/destinatário em CT-es diferentes.
 */
export const CTE_EMISSION_MAX_DOCUMENTS = 1000

export function isSelectionOverLimit(
  input: Readonly<{ count: number; groupingMode: CteEmissionGroupingMode }>,
): boolean {
  if (input.groupingMode !== 'sender_recipient') return false
  return input.count > CTE_EMISSION_MAX_DOCUMENTS
}

export const CTE_EMISSION_GROUPING_MODES: readonly CteEmissionGroupingMode[] = [
  'per_invoice',
  'sender_recipient',
]

export const DEFAULT_GROUPING_MODE: CteEmissionGroupingMode = 'per_invoice'

const PERCENTAGE_SHIFT = 2
const MINIMUM_PERCENTAGE_DECIMALS = 2

export type CteEmissionSelection = Readonly<{
  documentIds: readonly string[]
  emissionProfileId: string
  groupingMode: CteEmissionGroupingMode
}>

export type CteEmissionRow = Readonly<{
  baseAmount: string
  components: readonly Readonly<{ amount: string; label: string }>[]
  documentCount: number
  documentNumbers: readonly string[]
  fiscalAmount: string
  id: string
  matchedBy: string
  percentageLabel: string
  profileId: string
  profileName: string
  resolvedBy: 'auto' | 'manual'
}>

export type CteEmissionSummary = Readonly<{
  blockedCount: number
  projectedCount: number
  projectedDocumentIds: readonly string[]
  rows: readonly CteEmissionRow[]
  totalAmount: string
}>

export type CteEmissionBlockGroup = Readonly<{
  documentIds: readonly string[]
  reason: string
}>

export type CteEmissionStatus =
  | 'createError'
  | 'creating'
  | 'idle'
  | 'loading'
  | 'overLimit'
  | 'previewError'
  | 'ready'

export type CteEmissionProfileSelectOption = Readonly<{ label: string; value: string }>

function uniqueInOrder(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}

export function buildPreviewRequest(selection: CteEmissionSelection): CteBatchPreviewRequest {
  return {
    documentIds: uniqueInOrder(selection.documentIds),
    ...(selection.emissionProfileId === AUTOMATIC_PROFILE_ID
      ? {}
      : { emissionProfileId: selection.emissionProfileId }),
    groupingMode: selection.groupingMode,
  }
}

/** Duas seleções que geram a mesma requisição compartilham a projeção; qualquer diferença separa. */
export function buildPreviewQueryKey(
  input: CteEmissionSelection & Readonly<{ companyId: string | undefined }>,
): readonly unknown[] {
  return [
    CTE_EMISSION_PREVIEW_QUERY_KEY,
    input.companyId,
    uniqueInOrder(input.documentIds),
    input.emissionProfileId,
    input.groupingMode,
  ]
}

export function buildCreateRequest(
  input: CteEmissionSelection & Readonly<{ name: string }>,
): CteBatchPreviewRequest & Readonly<{ name: string }> {
  return { ...buildPreviewRequest(input), name: input.name }
}

/** A taxa vem como fração `numeric(9,6)`; converter por string evita float binário. */
export function toPercentageLabel(rate: string): string {
  const [wholePart = '0', fractionPart = ''] = rate.split('.')
  const padded = fractionPart.padEnd(PERCENTAGE_SHIFT, '0')
  const shiftedWhole = `${wholePart}${padded.slice(0, PERCENTAGE_SHIFT)}`.replace(/^0+(?=\d)/, '')
  const shiftedFraction = padded.slice(PERCENTAGE_SHIFT).replace(/0+$/, '')
  return `${shiftedWhole}.${shiftedFraction.padEnd(MINIMUM_PERCENTAGE_DECIMALS, '0')}`
}

export function summarizePreview(preview: CteEmissionPreview): CteEmissionSummary {
  const rows = preview.projections.map((projection) => ({
    baseAmount: projection.baseAmount,
    components: projection.fiscalComponents.map((component) => ({
      amount: component.amount,
      label: component.label,
    })),
    documentCount: projection.documents.length,
    documentNumbers: projection.documents.map((document) => document.number),
    fiscalAmount: projection.fiscalAmount,
    id: projection.documents.map((document) => document.documentId).join('|'),
    matchedBy: projection.profile.matchedBy,
    percentageLabel: toPercentageLabel(projection.percentage),
    profileId: projection.profile.id,
    profileName: projection.profile.name,
    resolvedBy: projection.profile.resolvedBy,
  }))

  return {
    blockedCount: preview.summary.blockedCount,
    projectedCount: preview.summary.projectedCount,
    projectedDocumentIds: preview.projections.flatMap((projection) =>
      projection.documents.map((document) => document.documentId),
    ),
    rows,
    totalAmount: preview.summary.totalAmount,
  }
}

export function groupBlocksByReason(
  blocks: readonly CteBatchPreviewBlock[],
): readonly CteEmissionBlockGroup[] {
  const grouped = new Map<string, string[]>()
  for (const block of blocks) {
    const documentIds = grouped.get(block.reason)
    if (documentIds === undefined) {
      grouped.set(block.reason, [block.documentId])
      continue
    }
    documentIds.push(block.documentId)
  }
  return [...grouped].map(([reason, documentIds]) => ({ documentIds, reason }))
}

export function resolveEmissionStatus(
  input: Readonly<{
    hasPreview: boolean
    isCreateError: boolean
    isCreating: boolean
    isOverLimit: boolean
    isPreviewError: boolean
    isPreviewFetching: boolean
  }>,
): CteEmissionStatus {
  if (input.isOverLimit) return 'overLimit'
  if (input.isCreating) return 'creating'
  if (input.isPreviewError) return 'previewError'
  if (input.isCreateError) return 'createError'
  if (input.isPreviewFetching || !input.hasPreview) return 'loading'
  return 'ready'
}

export function selectEmissionMessageKey(
  input: Readonly<{ errorCode: null | string; status: CteEmissionStatus }>,
): null | string {
  if (input.status === 'overLimit') return 'cteEmission.errorOverLimit'
  if (input.status === 'previewError') return 'cteEmission.errorPreview'
  if (input.status !== 'createError') return null
  return CREATE_ERROR_MESSAGE_KEYS[input.errorCode ?? ''] ?? 'cteEmission.errorCreate'
}

/** Editar durante a criação mudaria a projeção que o servidor já está gravando. */
export function isEmissionFormLocked(status: CteEmissionStatus): boolean {
  return status === 'creating'
}

/** A nota entrou em outro CT-e depois da projeção: o cache mente e precisa ser refeito. */
export function shouldRefreshPreviewAfterFailure(errorCode: null | string): boolean {
  return errorCode === DOCUMENT_ALREADY_LINKED_CODE
}

export function canConfirmEmission(
  input: Readonly<{ preview: CteEmissionPreview | null; status: CteEmissionStatus }>,
): boolean {
  if (input.preview === null) return false
  if (input.status !== 'createError' && input.status !== 'ready') return false
  return input.preview.projections.length > 0
}

export function buildProfileSelectOptions(
  input: Readonly<{
    automaticLabel: string
    profiles: readonly Readonly<{ id: string; name: string }>[]
  }>,
): readonly CteEmissionProfileSelectOption[] {
  return [
    { label: input.automaticLabel, value: AUTOMATIC_PROFILE_ID },
    ...input.profiles.map((profile) => ({ label: profile.name, value: profile.id })),
  ]
}

export function defaultBatchName(input: Readonly<{ count: number; issuedAt: string }>): string {
  return `CT-e ${input.issuedAt.slice(0, 10)} (${input.count})`
}

/** `customName` nulo significa "o operador ainda não escreveu nada" — vazio já é escolha dele. */
export function resolveBatchName(
  input: Readonly<{ customName: null | string; fallbackName: string; suggestedName: string }>,
): string {
  if (input.customName !== null) return input.customName
  return input.suggestedName === '' ? input.fallbackName : input.suggestedName
}
