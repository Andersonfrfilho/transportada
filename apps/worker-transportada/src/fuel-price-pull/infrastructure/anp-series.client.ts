/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Fronteira com o resumo semanal da ANP (ADR-0033). A semana ausente não chega como planilha vazia:
 * chega como 404 com `application/json`, e isso é resolvido antes de qualquer byte virar planilha.
 * Rótulo fora do vocabulário medido — produto ou UF — aborta em vez de gravar meia série; o ciclo
 * falha e a referência anterior fica de pé.
 */
import { z } from 'zod'

import type {
  FuelSeriesPort,
  FuelSeriesReference,
  FuelWeeklySeries,
} from '../application/fuel-series.port.js'
import {
  ANP_HEADER_LABEL,
  ANP_HEADER_LABELS,
  ANP_STATE_SHEET_NAME,
} from '../domain/anp-sheet.constant.js'
import {
  ANP_DISCARDED_PRODUCT_LABELS,
  ANP_PRODUCT_BY_LABEL,
  ANP_STATE_BY_NAME,
} from '../domain/anp-translation.constant.js'
import { readCellDecimal } from '../domain/decimal-cell.policy.js'
import { FUEL_UNIT_BY_PRODUCT } from '../domain/fuel.constant.js'
import { buildWeeklyWorkbookPath, readExcelSerialDate } from '../domain/reference-week.policy.js'

import { readAnpSheetRecords, type AnpSheetRecord } from './anp-workbook.reader.js'

const JSON_MEDIA_TYPE = 'json'
const WORKBOOK_MEDIA_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const sheetRowSchema = z.object({
  averagePrice: z.string().min(1),
  endingSerial: z.coerce.number().int().positive(),
  product: z.string().min(1),
  startingSerial: z.coerce.number().int().positive(),
  state: z.string().min(1),
  stationCount: z.coerce.number().int().nonnegative(),
})

type AnpSheetRow = z.infer<typeof sheetRowSchema>

export type AnpFuelReference = FuelSeriesReference

export type AnpWeeklySeries = FuelWeeklySeries

export type AnpSeriesFetch = (url: string, init: RequestInit) => Promise<Response>

export type AnpSeriesClient = FuelSeriesPort

function readSheetRow(record: AnpSheetRecord): AnpSheetRow {
  const parsed = sheetRowSchema.safeParse({
    averagePrice: record[ANP_HEADER_LABEL.averagePrice],
    endingSerial: record[ANP_HEADER_LABEL.endingDate],
    product: record[ANP_HEADER_LABEL.product],
    startingSerial: record[ANP_HEADER_LABEL.startingDate],
    state: record[ANP_HEADER_LABEL.state],
    stationCount: record[ANP_HEADER_LABEL.stationCount],
  })

  if (!parsed.success) {
    throw new Error('ANP_MALFORMED_ROW')
  }

  return parsed.data
}

function toReference(row: AnpSheetRow): AnpFuelReference | undefined {
  if (ANP_DISCARDED_PRODUCT_LABELS.has(row.product)) {
    return undefined
  }

  const product = ANP_PRODUCT_BY_LABEL[row.product]

  if (product === undefined) {
    throw new Error('ANP_UNKNOWN_PRODUCT')
  }

  const state = ANP_STATE_BY_NAME[row.state]

  if (state === undefined) {
    throw new Error('ANP_UNKNOWN_STATE')
  }

  return {
    averagePricePerUnit: readCellDecimal({ text: row.averagePrice }),
    product,
    state,
    stationCount: row.stationCount,
    unit: FUEL_UNIT_BY_PRODUCT[product],
  }
}

export function parseAnpWeeklyWorkbook(input: { readonly bytes: Uint8Array }): AnpWeeklySeries {
  const rows = readAnpSheetRecords({
    anchorLabel: ANP_HEADER_LABEL.state,
    bytes: input.bytes,
    headerLabels: ANP_HEADER_LABELS,
    sheetName: ANP_STATE_SHEET_NAME,
  }).map(readSheetRow)
  const first = rows[0]

  if (first === undefined) {
    throw new Error('ANP_EMPTY_SHEET')
  }

  const references = rows.map(toReference).filter((reference) => reference !== undefined)

  return {
    discardedRows: rows.length - references.length,
    references,
    weekEndingOn: readExcelSerialDate({ serial: first.endingSerial }),
    weekStartingOn: readExcelSerialDate({ serial: first.startingSerial }),
  }
}

async function readWorkbookBytes(response: Response): Promise<Uint8Array> {
  if (response.status === 404) {
    throw new Error('ANP_WEEK_UNAVAILABLE')
  }

  if (!response.ok) {
    throw new Error('ANP_UNEXPECTED_STATUS')
  }

  if ((response.headers.get('content-type') ?? '').includes(JSON_MEDIA_TYPE)) {
    throw new Error('ANP_WEEK_UNAVAILABLE')
  }

  return new Uint8Array(await response.arrayBuffer())
}

export function createAnpSeriesClient(dependencies: {
  readonly baseUrl: string
  readonly fetch: AnpSeriesFetch
  readonly timeoutInMilliseconds: number
}): AnpSeriesClient {
  const base = dependencies.baseUrl.replace(/\/+$/, '')

  return {
    async fetchWeeklySeries(week) {
      const response = await dependencies.fetch(`${base}/${buildWeeklyWorkbookPath(week)}`, {
        headers: { accept: WORKBOOK_MEDIA_TYPE },
        signal: AbortSignal.timeout(dependencies.timeoutInMilliseconds),
      })

      return parseAnpWeeklyWorkbook({ bytes: await readWorkbookBytes(response) })
    },
  }
}
