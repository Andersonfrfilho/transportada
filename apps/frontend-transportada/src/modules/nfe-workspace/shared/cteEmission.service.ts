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
  percentageLabel: string
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

export type CteEmissionStatus = 'creating' | 'error' | 'idle' | 'loading' | 'ready'

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
    percentageLabel: toPercentageLabel(projection.percentage),
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

export function canConfirmEmission(
  input: Readonly<{ preview: CteEmissionPreview | null; status: CteEmissionStatus }>,
): boolean {
  if (input.preview === null || input.status !== 'ready') return false
  return input.preview.projections.length > 0
}

export function defaultBatchName(input: Readonly<{ count: number; issuedAt: string }>): string {
  return `CT-e ${input.issuedAt.slice(0, 10)} (${input.count})`
}
