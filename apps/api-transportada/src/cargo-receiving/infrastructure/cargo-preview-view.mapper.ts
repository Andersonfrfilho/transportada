/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.2: linhas do banco viram a vista da prévia. A evidência do vínculo mora num jsonb que o
 * worker escreve; aqui ela é lida com cuidado, porque jsonb não tem tipo.
 */
import {
  CARGO_PREVIEW_ITEM_STATES,
  type CargoPreviewDecidedBy,
  type CargoPreviewFailureCode,
  type CargoPreviewItemState,
  type CargoPreviewSource,
  type CargoPreviewStatus,
} from '../../shared/cargo-preview.constant.js'
import type {
  CargoPreviewItemView,
  CargoPreviewLinkedDocument,
  CargoPreviewStateCounts,
  CargoPreviewSummary,
} from '../application/cargo-preview.types.js'

export type CargoPreviewSummaryRow = {
  readonly arrivalId: string | null
  readonly contractorId: string
  readonly contractorName: string | null
  readonly createdAt: Date
  readonly errorCode: CargoPreviewFailureCode | null
  readonly fileName: string
  readonly fileSha256: string
  readonly fileSizeBytes: number
  readonly id: string
  readonly plannedDate: string | null
  readonly receivedAt: Date
  readonly rowCount: number | null
  readonly sheetName: string | null
  readonly source: CargoPreviewSource
  readonly status: CargoPreviewStatus
  readonly updatedAt: Date
}

export type CargoPreviewItemRow = Omit<
  CargoPreviewItemView,
  'candidateDocumentIds' | 'document' | 'evidence' | 'matchedAt' | 'rowErrors'
> & {
  readonly documentImportedAt: Date | null
  readonly documentIssuedAt: Date | null
  readonly documentNumber: string | null
  readonly documentRecipientName: string | null
  readonly documentSeries: string | null
  readonly documentTotalValue: string | null
  readonly matchEvidence: Readonly<Record<string, unknown>> | null
  readonly matchedAt: Date | null
  readonly matchedBy: CargoPreviewDecidedBy | null
  readonly matchedDocumentId: string | null
  readonly rowError: readonly Readonly<Record<string, unknown>>[] | null
}

export function toCargoPreviewSummary(row: CargoPreviewSummaryRow): CargoPreviewSummary {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    receivedAt: row.receivedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function emptyStateCounts(): CargoPreviewStateCounts {
  return { ambiguous: 0, awaiting_xml: 0, invalid: 0, matched: 0, suggested: 0, total: 0 }
}

export function toStateCounts(
  rows: readonly { readonly count: number; readonly state: CargoPreviewItemState }[],
): CargoPreviewStateCounts {
  const counts: Record<string, number> = emptyStateCounts()
  for (const row of rows) {
    if (!CARGO_PREVIEW_ITEM_STATES.includes(row.state)) continue
    counts[row.state] = (counts[row.state] ?? 0) + row.count
    counts.total = (counts.total ?? 0) + row.count
  }
  return counts as CargoPreviewStateCounts
}

function readStringList(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

function toLinkedDocument(row: CargoPreviewItemRow): CargoPreviewLinkedDocument | null {
  if (row.matchedDocumentId === null || row.documentNumber === null) return null
  return {
    id: row.matchedDocumentId,
    importedAt: row.documentImportedAt?.toISOString() ?? '',
    issuedAt: row.documentIssuedAt?.toISOString() ?? '',
    number: row.documentNumber,
    recipientName: row.documentRecipientName,
    series: row.documentSeries ?? '',
    totalValue: row.documentTotalValue ?? '',
  }
}

export function toCargoPreviewItemView(row: CargoPreviewItemRow): CargoPreviewItemView {
  return {
    address: row.address,
    candidateDocumentIds: readStringList(row.matchEvidence?.candidateDocumentIds),
    city: row.city,
    contractorReference: row.contractorReference,
    document: toLinkedDocument(row),
    evidence: readStringList(row.matchEvidence?.evidence),
    id: row.id,
    matchGroupKey: row.matchGroupKey,
    matchState: row.matchState,
    matchedAt: row.matchedAt?.toISOString() ?? null,
    matchedBy: row.matchedBy,
    neighborhood: row.neighborhood,
    postalCode: row.postalCode,
    recipientCode: row.recipientCode,
    recipientName: row.recipientName,
    routeName: row.routeName,
    routingDate: row.routingDate,
    rowErrors: row.rowError ?? [],
    rowNumber: row.rowNumber,
    state: row.state,
    value: row.value,
    volumeM3: row.volumeM3,
    weightKg: row.weightKg,
  }
}
