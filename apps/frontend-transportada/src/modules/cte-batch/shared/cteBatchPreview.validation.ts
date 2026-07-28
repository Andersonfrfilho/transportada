/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  CteBatchGroupingMode,
  CteBatchPreview,
  CteBatchPreviewBlock,
  CteBatchPreviewComponent,
  CteBatchPreviewDocument,
  CteBatchPreviewProfile,
  CteBatchPreviewProjection,
  CteBatchPreviewSummary,
} from './cteBatchPreview.types'

const INVALID = 'CTE_BATCH_INVALID_PREVIEW_RESPONSE'

const GROUPING_MODES: readonly CteBatchGroupingMode[] = ['per_invoice', 'sender_recipient']

function invalid(): Error {
  return new Error(INVALID)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string {
  if (typeof value !== 'string') throw invalid()
  return value
}

function readInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw invalid()
  return value
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw invalid()
  return value
}

function readArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw invalid()
  return value
}

/** Só os envelopes fechados rejeitam chave extra; a projeção fiscal ainda cresce por task. */
function rejectExtraKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) throw invalid()
}

function readBlock(input: unknown): CteBatchPreviewBlock {
  const block = readRecord(input)
  rejectExtraKeys(block, ['batchId', 'documentId', 'reason'])
  const batchId = block.batchId
  if (batchId !== null && typeof batchId !== 'string') throw invalid()
  return {
    batchId,
    documentId: readString(block.documentId),
    reason: readString(block.reason),
  }
}

function readDocument(input: unknown): CteBatchPreviewDocument {
  const document = readRecord(input)
  return {
    ...document,
    accessKey: readString(document.accessKey),
    documentId: readString(document.documentId),
    number: readString(document.number),
    series: readString(document.series),
    totalAmount: readString(document.totalAmount),
  }
}

function readComponent(input: unknown): CteBatchPreviewComponent {
  const component = readRecord(input)
  return {
    ...component,
    amount: readString(component.amount),
    calculationType: readString(component.calculationType),
    label: readString(component.label),
  }
}

function readGroupingMode(value: unknown): CteBatchGroupingMode {
  const mode = readString(value)
  if (!GROUPING_MODES.includes(mode as CteBatchGroupingMode)) throw invalid()
  return mode as CteBatchGroupingMode
}

function readProfile(input: unknown): CteBatchPreviewProfile {
  const profile = readRecord(input)
  const resolvedBy = readString(profile.resolvedBy)
  if (resolvedBy !== 'auto' && resolvedBy !== 'manual') throw invalid()
  return {
    ...profile,
    groupingMode: readGroupingMode(profile.groupingMode),
    id: readString(profile.id),
    matchedBy: readString(profile.matchedBy),
    name: readString(profile.name),
    resolvedBy,
  }
}

function readProjection(input: unknown): CteBatchPreviewProjection {
  const projection = readRecord(input)
  return {
    ...projection,
    baseAmount: readString(projection.baseAmount),
    documents: readArray(projection.documents).map(readDocument),
    fiscalAmount: readString(projection.fiscalAmount),
    fiscalComponents: readArray(projection.fiscalComponents).map(readComponent),
    percentage: readString(projection.percentage),
    profile: readProfile(projection.profile),
    recipientTaxId: readString(projection.recipientTaxId),
    senderTaxId: readString(projection.senderTaxId),
  }
}

function readSummary(input: unknown): CteBatchPreviewSummary {
  const summary = readRecord(input)
  rejectExtraKeys(summary, ['blockedCount', 'documentCount', 'projectedCount', 'totalAmount'])
  return {
    blockedCount: readInteger(summary.blockedCount),
    documentCount: readInteger(summary.documentCount),
    projectedCount: readInteger(summary.projectedCount),
    totalAmount: readString(summary.totalAmount),
  }
}

export function createCteBatchPreviewAdapter(): (input: unknown) => CteBatchPreview {
  return (input) => {
    const preview = readRecord(input)
    rejectExtraKeys(preview, ['blocked', 'projections', 'summary'])
    return {
      blocked: readArray(preview.blocked).map(readBlock),
      projections: readArray(preview.projections).map(readProjection),
      summary: readSummary(preview.summary),
    }
  }
}
