/* Copyright (c) 2026 Ada Technology. MIT License. */
import { sumScaledAmounts } from '@/modules/shared/decimalAmount.service'

import {
  NFSE_INVOICE_ERROR,
  NFSE_INVOICE_FEEDBACK_KEY_BY_ERROR,
  NFSE_MANAGE_PERMISSION,
} from './nfseInvoice.constant'
import type {
  NfseInvoicePreview,
  NfseInvoiceSelection,
  NfsePreviewBlock,
  NfsePreviewInvoice,
} from './nfseInvoice.types'

export const NFSE_EMISSION_PREVIEW_QUERY_KEY = 'nfse-emission-preview'

/** Dezenas de milhares de linhas no DOM travam a janela; o restante vira contagem no rodapé. */
export const NFSE_EMISSION_MAX_VISIBLE_ROWS = 50

/** Vocabulário do motor de descrição da API: o que não está aqui sai como `{{variavel}}` cru. */
export const NFSE_DESCRIPTION_VARIABLES = [
  'municipio',
  'notas',
  'observacoes',
  'periodo',
  'quantidadeNotas',
] as const

const IDEMPOTENCY_KEY_PREFIX = 'nfse-emission'

/** Códigos de transporte não dizem o que houve — a mensagem do estado explica melhor que eles. */
const GENERIC_ERROR_CODES: readonly string[] = Object.values(NFSE_INVOICE_ERROR)

export type NfseEmissionStatus =
  | 'createError'
  | 'creating'
  | 'idle'
  | 'loading'
  | 'previewError'
  | 'ready'

export type NfseEmissionRow = Readonly<{
  description: string
  documentCount: number
  documentIds: readonly string[]
  documentNumbers: readonly string[]
  id: string
  issAmount: string
  issRate: string
  omittedDocuments: number
  serviceAmount: string
  takerLegalName: string
  takerTaxId: string
}>

export type NfseEmissionBlockGroup = Readonly<{
  documentIds: readonly string[]
  reason: string
}>

export type NfseEmissionSummary = Readonly<{
  blockedCount: number
  invoiceCount: number
  profileId: null | string
  rows: readonly NfseEmissionRow[]
  totalIssAmount: string
  totalServiceAmount: string
}>

export type NfseEmissionSelectOption = Readonly<{ label: string; value: string }>

export function canOpenNfseEmission(permissions: readonly string[]): boolean {
  return permissions.includes(NFSE_MANAGE_PERMISSION)
}

function uniqueDocumentIds(documentIds: readonly string[]): readonly string[] {
  return [...new Set(documentIds)]
}

/** A descrição listada na prévia é texto renderizado; as notas do tomador vêm todas. */
function toRow(invoice: NfsePreviewInvoice): NfseEmissionRow {
  return {
    description: invoice.description,
    documentCount: invoice.documents.length,
    documentIds: invoice.documents.map((document) => document.documentId),
    documentNumbers: invoice.documents.map((document) => document.number),
    id: invoice.takerTaxId,
    issAmount: invoice.issAmount,
    issRate: invoice.issRate,
    omittedDocuments: invoice.omittedDocuments,
    serviceAmount: invoice.serviceAmount,
    takerLegalName: invoice.takerLegalName,
    takerTaxId: invoice.takerTaxId,
  }
}

export function summarizeNfsePreview(preview: NfseInvoicePreview): NfseEmissionSummary {
  const rows = preview.invoices
    .map(toRow)
    .sort((left, right) => left.takerLegalName.localeCompare(right.takerLegalName, 'pt-BR'))

  return {
    blockedCount: preview.blocked.length,
    invoiceCount: rows.length,
    profileId: preview.invoices[0]?.profileId ?? null,
    rows,
    totalIssAmount: sumScaledAmounts(rows.map((row) => row.issAmount)),
    totalServiceAmount: sumScaledAmounts(rows.map((row) => row.serviceAmount)),
  }
}

export function groupNfseBlocksByReason(
  blocked: readonly NfsePreviewBlock[],
): readonly NfseEmissionBlockGroup[] {
  const documentIdsByReason = new Map<string, string[]>()

  for (const block of blocked) {
    const documentIds = documentIdsByReason.get(block.reason)
    if (documentIds === undefined) documentIdsByReason.set(block.reason, [block.documentId])
    else documentIds.push(block.documentId)
  }

  return [...documentIdsByReason].map(([reason, documentIds]) => ({ documentIds, reason }))
}

/** Campo apagado é escolha do operador: só a ausência de edição devolve o modelo do perfil. */
export function resolveNfseDescription(
  input: Readonly<{ custom: null | string; profileTemplate: string }>,
): string {
  return input.custom ?? input.profileTemplate
}

/** Descrição intocada não vai no corpo: a API aplica a do perfil, e repeti-la é ruído. */
function resolveDescriptionTemplate(
  input: Readonly<{ description: string; profileTemplate: string }>,
): null | string {
  return input.description === input.profileTemplate ? null : input.description
}

export function buildNfsePreviewRequest(
  input: Readonly<{
    description: string
    documentIds: readonly string[]
    profileId: string
    profileTemplate: string
  }>,
): NfseInvoiceSelection {
  const descriptionTemplate = resolveDescriptionTemplate(input)

  return {
    documentIds: uniqueDocumentIds(input.documentIds),
    profileId: input.profileId,
    ...(descriptionTemplate === null ? {} : { descriptionTemplate }),
  }
}

/**
 * A criação aceita um tomador só (`NFSE_INVOICE_CREATE_SPANS_MULTIPLE_TAKERS`): confirmar dispara
 * uma criação por grupo da prévia, cada uma com as notas daquele tomador.
 */
export function buildNfseCreateRequests(
  input: Readonly<{
    description: string
    profileTemplate: string
    summary: NfseEmissionSummary
  }>,
): readonly NfseInvoiceSelection[] {
  const profileId = input.summary.profileId
  if (profileId === null) return []
  const descriptionTemplate = resolveDescriptionTemplate(input)

  return input.summary.rows.map((row) => ({
    documentIds: row.documentIds,
    profileId,
    ...(descriptionTemplate === null ? {} : { descriptionTemplate }),
  }))
}

/** Mesma tentativa, mesma chave: repetir o clique não emite a nota do tomador duas vezes. */
export function buildNfseIdempotencyKeys(
  input: Readonly<{ count: number; token: string }>,
): readonly string[] {
  return Array.from(
    { length: input.count },
    (_, index) => `${IDEMPOTENCY_KEY_PREFIX}.${input.token}.${index + 1}`,
  )
}

export function buildNfsePreviewQueryKey(
  input: Readonly<{
    companyId?: string
    description: string
    documentIds: readonly string[]
    profileId: null | string
    profileTemplate: string
  }>,
): readonly unknown[] {
  return [
    NFSE_EMISSION_PREVIEW_QUERY_KEY,
    input.companyId ?? null,
    input.profileId,
    resolveDescriptionTemplate(input),
    [...uniqueDocumentIds(input.documentIds)].sort(),
  ]
}

export function resolveNfseEmissionStatus(
  input: Readonly<{
    hasPreview: boolean
    isCreateError: boolean
    isCreating: boolean
    isPreviewError: boolean
    isPreviewFetching: boolean
  }>,
): NfseEmissionStatus {
  if (input.isCreating) return 'creating'
  if (input.isPreviewError) return 'previewError'
  if (!input.hasPreview || input.isPreviewFetching) return 'loading'
  if (input.isCreateError) return 'createError'
  return 'ready'
}

export function isNfseEmissionFormLocked(status: NfseEmissionStatus): boolean {
  return status === 'creating'
}

export function canConfirmNfseEmission(
  input: Readonly<{
    canIssue: boolean
    profileId: null | string
    status: NfseEmissionStatus
    summary: NfseEmissionSummary | null
  }>,
): boolean {
  if (!input.canIssue || input.profileId === null) return false
  if (input.summary === null || input.summary.rows.length === 0) return false
  return input.status === 'ready' || input.status === 'createError'
}

export function selectNfseEmissionMessageKey(
  input: Readonly<{ errorCode: null | string; status: NfseEmissionStatus }>,
): null | string {
  if (input.status !== 'createError' && input.status !== 'previewError') return null

  const isSpecific = input.errorCode !== null && !GENERIC_ERROR_CODES.includes(input.errorCode)
  const feedbackKey = isSpecific
    ? NFSE_INVOICE_FEEDBACK_KEY_BY_ERROR[input.errorCode ?? '']
    : undefined
  if (feedbackKey !== undefined) return `feedback.${feedbackKey}`

  return input.status === 'previewError' ? 'emission.errorPreview' : 'emission.errorCreate'
}

export function buildNfseProfileSelectOptions(
  profiles: readonly Readonly<{ id: string; name: string }>[],
): readonly NfseEmissionSelectOption[] {
  return profiles.map((profile) => ({ label: profile.name, value: profile.id }))
}
