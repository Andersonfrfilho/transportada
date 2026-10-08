/* Copyright (c) 2026 Ada Technology. MIT License. */
import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { formatMomentWithLocale } from '@/modules/shared/momentFormat.service'
import type {
  SpreadsheetColumn,
  SpreadsheetLegendItem,
  SpreadsheetToneRow,
} from '@/modules/shared/spreadsheet/spreadsheetLayout.service'

import { TRIP_REPORT_TONES, type TripReportRow } from './tripReport.types'

const TRIP_ID_DISPLAY_LENGTH = 8
const LEGEND_TONES = [
  TRIP_REPORT_TONES.WAREHOUSE,
  TRIP_REPORT_TONES.ON_ROUTE,
  TRIP_REPORT_TONES.FINISHED,
  TRIP_REPORT_TONES.TOTAL_RETURN,
] as const

export type BuildTripReportRowsParams = Readonly<{
  locale: string
  rows: readonly TripReportRow[]
  translate: (key: string) => string
}>

export type TripReportSheet = Readonly<{
  columns: readonly SpreadsheetColumn[]
  legend: readonly SpreadsheetLegendItem[]
  rows: readonly SpreadsheetToneRow[]
}>

function formatMoment(params: { locale: string; value: string | undefined }): string {
  if (params.value === undefined) return ''
  return formatMomentWithLocale({ locale: params.locale, value: params.value })
}

function formatCityState(row: TripReportRow): string {
  return [row.recipientCity, row.recipientState]
    .filter((part) => part !== null && part !== '')
    .join('/')
}

function buildCells(
  row: TripReportRow,
  hasAmount: boolean,
  locale: string,
  translate: BuildTripReportRowsParams['translate'],
) {
  const amountCells = hasAmount ? [row.amount === undefined ? '' : formatAmount(row.amount)] : []
  return [
    row.tripId.slice(0, TRIP_ID_DISPLAY_LENGTH),
    `${row.documentNumber}/${row.documentSeries}`,
    row.accessKey,
    row.contractorName ?? '',
    row.recipientName,
    formatCityState(row),
    ...amountCells,
    translate(`filters.report.documentStatuses.${row.documentStatus}`),
    formatMoment({ locale, value: row.deliveredAt }),
    formatMoment({ locale, value: row.returnedAt }),
    row.returnReason ?? '',
  ]
}

function buildColumns(
  hasAmount: boolean,
  translate: BuildTripReportRowsParams['translate'],
): readonly SpreadsheetColumn[] {
  const column = (key: string, width: number): SpreadsheetColumn => ({
    header: translate(`reportExport.columns.${key}`),
    width,
  })
  return [
    column('trip', 12),
    column('document', 12),
    column('accessKey', 48),
    column('contractor', 28),
    column('recipient', 32),
    column('city', 24),
    ...(hasAmount ? [{ ...column('amount', 16), align: 'right' as const }] : []),
    column('documentStatus', 18),
    column('deliveredAt', 18),
    column('returnedAt', 18),
    column('returnReason', 32),
  ]
}

/** A coluna de valor só existe quando a API a devolveu (`trip.financials`): sem permissão, sem coluna. */
export function buildTripReportRows(params: BuildTripReportRowsParams): TripReportSheet {
  const hasAmount = params.rows.some((row) => row.amount !== undefined)
  return {
    columns: buildColumns(hasAmount, params.translate),
    legend: LEGEND_TONES.map((tone) => ({
      label: params.translate(`reportExport.legend.${tone}`),
      tone,
    })),
    rows: params.rows.map((row) => ({
      cells: buildCells(row, hasAmount, params.locale, params.translate),
      tone: row.tone,
    })),
  }
}
