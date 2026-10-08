/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 253 RF10: a faixa de informações de cada bloco. Nunca CPF, telefone, bucket nem chave de
 * objeto — só o que o relatório já mostra. O valor só entra quando a linha o carrega (`trip.financials`).
 */
import { formatBrazilianAmount, parseAmountToCents } from './occurrence-amount.policy.js'
import {
  TRIP_PROOF_REPORT_DATE_LABELS,
  TRIP_PROOF_REPORT_FIELD_SEPARATOR,
  TRIP_PROOF_REPORT_STATUS_LABELS,
  TRIP_PROOF_REPORT_TEXT,
  TRIP_PROOF_REPORT_TIME_ZONE,
  TRIP_PROOF_REPORT_TONE_LABELS,
} from './trip-proof-report.constant.js'
import type { TripProofBlock } from './trip-proof-report.types.js'
import type { TripReportRow } from './trip-report.types.js'

const TRIP_SHORT_ID_LENGTH = 8
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
  month: '2-digit',
  timeZone: TRIP_PROOF_REPORT_TIME_ZONE,
  year: 'numeric',
})

export function buildTripProofInfoLines(block: TripProofBlock): readonly string[] {
  const { row } = block
  return [buildDocumentLine(block), buildPartiesLine(row), buildSituationLine(row)]
}

export function formatTripProofDateTime(isoInstant: string): string {
  const parts = Object.fromEntries(
    dateTimeFormatter.formatToParts(new Date(isoInstant)).map((part) => [part.type, part.value]),
  )
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`
}

function join(fields: readonly (string | undefined)[]): string {
  return fields
    .filter((field): field is string => field !== undefined && field !== '')
    .join(TRIP_PROOF_REPORT_FIELD_SEPARATOR)
}

function buildDocumentLine(block: TripProofBlock): string {
  const { row } = block
  return join([
    `${TRIP_PROOF_REPORT_TEXT.documentTitle} ${row.documentNumber}`,
    `${TRIP_PROOF_REPORT_TEXT.documentSeries} ${row.documentSeries}`,
    block.proofTotal > 1
      ? `${TRIP_PROOF_REPORT_TEXT.proofOf} ${block.proofIndex} ${TRIP_PROOF_REPORT_TEXT.pageOf} ${block.proofTotal}`
      : undefined,
    row.amount === undefined
      ? undefined
      : `${TRIP_PROOF_REPORT_TEXT.valueLabel} R$ ${formatBrazilianAmount(parseAmountToCents(row.amount))}`,
  ])
}

function buildPartiesLine(row: TripReportRow): string {
  const place = [row.recipientCity, row.recipientState].filter(
    (part): part is string => part !== null && part !== '',
  )
  return join([row.contractorName ?? undefined, row.recipientName, place.join('/')])
}

function buildSituationLine(row: TripReportRow): string {
  return join([
    `${TRIP_PROOF_REPORT_TEXT.tripLabel} ${row.tripId.slice(0, TRIP_SHORT_ID_LENGTH)}`,
    TRIP_PROOF_REPORT_TONE_LABELS[row.tone],
    TRIP_PROOF_REPORT_STATUS_LABELS[row.documentStatus],
    row.deliveredAt === undefined
      ? undefined
      : `${TRIP_PROOF_REPORT_DATE_LABELS.delivered} ${formatTripProofDateTime(row.deliveredAt)}`,
    row.returnedAt === undefined
      ? undefined
      : `${TRIP_PROOF_REPORT_DATE_LABELS.returned} ${formatTripProofDateTime(row.returnedAt)}`,
    row.returnReason === undefined
      ? undefined
      : `${TRIP_PROOF_REPORT_TEXT.returnReason}: ${row.returnReason}`,
  ])
}
