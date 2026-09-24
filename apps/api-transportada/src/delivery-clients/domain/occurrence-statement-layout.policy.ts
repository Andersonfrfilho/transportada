/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T20 (RF29/RF30). A política pura do demonstrativo de ressarcimento: recebe o lote, as
 * linhas e as evidências já resolvidas, e devolve a estrutura que o gateway desenha. Molde de
 * `billing/domain/invoice-layout.policy.ts`, **duplicado de propósito** — aquele carrega cabeçalho
 * de documento fiscal, e este documento não é fiscal (RF30).
 *
 * ⚠️ Nada aqui faz I/O, e é isso que torna o teto testável sem desenhar uma página.
 */
import {
  OCCURRENCE_STATEMENT_MAX_BYTES,
  OCCURRENCE_STATEMENT_ROWS_PER_PAGE,
} from './occurrence-statement-limits.constant.js'
import { ExtraChargeBatchStatementTooLargeError } from './occurrence-statement.error.js'

/** RF30: a frase vai **dentro** do documento — confundir isto com fiscal é o erro caro. */
export const OCCURRENCE_STATEMENT_DISCLAIMER =
  'Este documento NÃO é documento fiscal: não é CT-e, não é NFS-e, não substitui nota fiscal e não possui numeração fiscal. É um demonstrativo de ressarcimento entre transportadora e contratante.'

export const OCCURRENCE_STATEMENT_TITLE = 'DEMONSTRATIVO DE RESSARCIMENTO'

const EXPIRED_EVIDENCE_LABEL = 'Foto expurgada pelo prazo de guarda — evidência não disponível.'
const MISSING_EVIDENCE_LABEL = 'Foto indisponível no momento da geração.'
const WITHOUT_EVIDENCE_LABEL = 'Ocorrência sem foto registrada.'
const SEPARATOR = ' · '
const THOUSANDS_PATTERN = /\B(?=(\d{3})+(?!\d))/gu
const ISO_DATE_LENGTH = 10

export const OCCURRENCE_STATEMENT_CHARGE_TYPE_LABELS = {
  other: 'Outros',
  parking: 'Estacionamento',
  platform: 'Plataforma',
  returned_goods: 'Mercadoria devolvida',
  scheduling: 'Agendamento',
  unloading: 'Descarga',
} as const

/**
 * A evidência de uma linha, já resolvida pela aplicação. `image` é a foto de `position: 1`
 * (miniatura quando existe); os demais valores viram **selo textual**, nunca imagem quebrada.
 */
export type OccurrenceStatementEvidence =
  | { readonly kind: 'expired' }
  | { readonly kind: 'image'; readonly bytes: Uint8Array; readonly mimeType: string }
  | { readonly kind: 'missing' }
  | { readonly kind: 'none' }

export type OccurrenceStatementSourceRow = {
  readonly accessKey: string | null
  readonly amount: string
  readonly chargeType: keyof typeof OCCURRENCE_STATEMENT_CHARGE_TYPE_LABELS
  readonly chargedOn: string
  readonly clientName: string
  readonly evidence: OccurrenceStatementEvidence
  readonly id: string
  readonly notes: string
  readonly noteNumber: string | null
  readonly noteSeries: string | null
  /** Total de fotos da ocorrência. O corpo leva uma; as demais entram por contagem. */
  readonly photoCount: number
  readonly productCodes: readonly string[]
}

export type OccurrenceStatementBatch = {
  readonly closedAt: Date
  readonly contractorName: string
  readonly id: string
  readonly periodEnd: string
  readonly periodStart: string
  readonly totalAmount: string
}

export type OccurrenceStatementCarrier = {
  readonly legalName: string
  readonly taxLine: string
}

export type OccurrenceStatementField = {
  readonly label: string
  readonly value: string
}

export type OccurrenceStatementRow = {
  readonly amountText: string
  readonly evidence: OccurrenceStatementEvidence
  /** O selo textual quando não há imagem; string vazia quando a imagem entra no corpo. */
  readonly evidenceSeal: string
  readonly extraPhotosText: string
  readonly headline: string
  readonly noteText: string
  readonly productsText: string
}

export type OccurrenceStatementPage = {
  readonly pageNumber: number
  readonly rows: readonly OccurrenceStatementRow[]
}

export type OccurrenceStatementLayout = {
  readonly batch: readonly OccurrenceStatementField[]
  readonly carrier: OccurrenceStatementCarrier
  readonly disclaimer: string
  /** Soma dos bytes que vão embutidos como imagem — o termo dominante do tamanho do PDF. */
  readonly embeddedImageBytes: number
  readonly pageCount: number
  readonly pages: readonly OccurrenceStatementPage[]
  readonly title: string
  readonly totalText: string
}

export type BuildOccurrenceStatementLayoutInput = {
  readonly batch: OccurrenceStatementBatch
  readonly carrier: OccurrenceStatementCarrier
  readonly maxBytes?: number
  readonly rows: readonly OccurrenceStatementSourceRow[]
  readonly rowsPerPage?: number
}

export function buildOccurrenceStatementLayout(
  input: BuildOccurrenceStatementLayoutInput,
): OccurrenceStatementLayout {
  const maxBytes = input.maxBytes ?? OCCURRENCE_STATEMENT_MAX_BYTES
  const embeddedImageBytes = sumEmbeddedImageBytes(input.rows)
  /**
   * Recusa antes de montar: o PDF final nunca é menor que as imagens que carrega, então passar
   * disto aqui já garante estouro — gastar a montagem inteira para recusar depois é desperdício.
   */
  if (embeddedImageBytes > maxBytes) {
    throw new ExtraChargeBatchStatementTooLargeError({
      limitBytes: maxBytes,
      measuredBytes: embeddedImageBytes,
    })
  }

  const rows = input.rows.map(toLayoutRow)
  const pages = paginateRows(rows, input.rowsPerPage ?? OCCURRENCE_STATEMENT_ROWS_PER_PAGE)

  return {
    batch: buildBatchFields(input.batch),
    carrier: input.carrier,
    disclaimer: OCCURRENCE_STATEMENT_DISCLAIMER,
    embeddedImageBytes,
    pageCount: pages.length,
    pages,
    title: OCCURRENCE_STATEMENT_TITLE,
    totalText: `R$ ${formatDecimalText(input.batch.totalAmount)}`,
  }
}

function sumEmbeddedImageBytes(rows: readonly OccurrenceStatementSourceRow[]): number {
  return rows.reduce(
    (accumulated, row) =>
      row.evidence.kind === 'image' ? accumulated + row.evidence.bytes.byteLength : accumulated,
    0,
  )
}

function buildBatchFields(batch: OccurrenceStatementBatch): readonly OccurrenceStatementField[] {
  return [
    /** ⚠️ O identificador é o id do lote. Demonstrativo não tem — e nunca terá — numeração fiscal. */
    { label: 'Lote', value: batch.id },
    { label: 'Contratante', value: batch.contractorName },
    {
      label: 'Período',
      value: `${formatIsoDate(batch.periodStart)} a ${formatIsoDate(batch.periodEnd)}`,
    },
    { label: 'Fechado em', value: formatDate(batch.closedAt) },
  ]
}

function toLayoutRow(row: OccurrenceStatementSourceRow): OccurrenceStatementRow {
  return {
    amountText: `R$ ${formatDecimalText(row.amount)}`,
    evidence: row.evidence,
    evidenceSeal: resolveEvidenceSeal(row.evidence),
    extraPhotosText: formatExtraPhotos(row),
    headline: [
      formatNote(row),
      row.clientName,
      formatIsoDate(row.chargedOn),
      OCCURRENCE_STATEMENT_CHARGE_TYPE_LABELS[row.chargeType],
    ]
      .filter((part) => part !== '')
      .join(SEPARATOR),
    noteText: row.notes.trim(),
    productsText: row.productCodes.length === 0 ? '' : `Itens: ${row.productCodes.join(', ')}`,
  }
}

function resolveEvidenceSeal(evidence: OccurrenceStatementEvidence): string {
  if (evidence.kind === 'image') return ''
  if (evidence.kind === 'expired') return EXPIRED_EVIDENCE_LABEL
  return evidence.kind === 'missing' ? MISSING_EVIDENCE_LABEL : WITHOUT_EVIDENCE_LABEL
}

/** As demais fotos da mesma ocorrência entram por contagem — anexar todas faz o PDF explodir. */
function formatExtraPhotos(row: OccurrenceStatementSourceRow): string {
  const embedded = row.evidence.kind === 'image' ? 1 : 0
  const remaining = row.photoCount - embedded
  if (remaining <= 0) return ''
  return remaining === 1
    ? 'Mais 1 foto arquivada nesta ocorrência.'
    : `Mais ${remaining} fotos arquivadas nesta ocorrência.`
}

function paginateRows(
  rows: readonly OccurrenceStatementRow[],
  rowsPerPage: number,
): readonly OccurrenceStatementPage[] {
  if (rows.length === 0) return [{ pageNumber: 1, rows: [] }]

  const pages: OccurrenceStatementPage[] = []
  for (let offset = 0; offset < rows.length; offset += rowsPerPage) {
    pages.push({ pageNumber: pages.length + 1, rows: rows.slice(offset, offset + rowsPerPage) })
  }
  return pages
}

function formatNote(row: OccurrenceStatementSourceRow): string {
  if (row.noteNumber === null) return row.accessKey === null ? 'Sem nota vinculada' : row.accessKey
  return row.noteSeries === null ? `NF ${row.noteNumber}` : `NF ${row.noteNumber}/${row.noteSeries}`
}

export function formatOccurrenceStatementDate(value: Date): string {
  return formatDate(value)
}

function formatDate(value: Date): string {
  const day = String(value.getUTCDate()).padStart(2, '0')
  const month = String(value.getUTCMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${value.getUTCFullYear()}`
}

function formatIsoDate(value: string): string {
  if (value.length < ISO_DATE_LENGTH) return value
  return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`
}

function formatDecimalText(value: string): string {
  const [integerPart, fractionalPart] = value.split('.', 2)
  const grouped = (integerPart ?? '0').replace(THOUSANDS_PATTERN, '.')
  return fractionalPart === undefined ? grouped : `${grouped},${fractionalPart}`
}
