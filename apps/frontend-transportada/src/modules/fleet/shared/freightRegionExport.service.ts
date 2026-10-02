/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  toSpreadsheetNumber,
  type SpreadsheetCellValue,
  type SpreadsheetColumn,
} from '@/modules/shared/spreadsheet/spreadsheetLayout.service'
import {
  CSV_BYTE_ORDER_MARK,
  CSV_FIELD_SEPARATOR,
  CSV_LINE_SEPARATOR,
  escapeCsvField,
} from '@/modules/shared/csv.service'
import { FREIGHT_VEHICLE_CLASSES } from '@/modules/shared/freightClass.constant'

import type { FreightRegion } from './freightRegion.types'
import { rateOfRegion } from './freightRegionTable.service'

/** A ordem da lista é a ordem das colunas do arquivo. */
export const FREIGHT_REGION_EXPORT_COLUMNS = [
  'code',
  'name',
  'zone',
  'cities',
  ...FREIGHT_VEHICLE_CLASSES,
] as const

export type FreightRegionExportColumn = (typeof FREIGHT_REGION_EXPORT_COLUMNS)[number]

export const FREIGHT_REGION_EXPORT_FILE_NAME = 'regioes-frete.csv'
export const FREIGHT_REGION_EXPORT_EXCEL_FILE_NAME = 'regioes-frete.xlsx'
export const FREIGHT_REGION_EXPORT_MEDIA_TYPE = 'text/csv;charset=utf-8'

const CITY_SEPARATOR = ', '
const CITY_LINE_SEPARATOR = '\n'

function toSpreadsheetDecimal(value: null | string): string {
  return value === null ? '' : value.replace('.', ',')
}

function describeCity(input: Readonly<{ city: string; state: string }>): string {
  return `${input.city}/${input.state}`
}

function readColumn(
  input: Readonly<{ column: FreightRegionExportColumn; region: FreightRegion }>,
): string {
  const { column, region } = input
  if (column === 'code') return region.code
  if (column === 'name') return region.name
  if (column === 'zone') return String(region.zone)
  if (column === 'cities') return region.cities.map(describeCity).join(CITY_SEPARATOR)

  return toSpreadsheetDecimal(rateOfRegion(region, column))
}

const FREIGHT_REGION_TEXT_COLUMNS: ReadonlySet<FreightRegionExportColumn> = new Set([
  'cities',
  'code',
  'name',
])

/** Cabeçalho, largura e formato: o código é texto, a zona e os valores por classe são número. */
export function buildFreightRegionExportColumns(
  header: Readonly<Record<FreightRegionExportColumn, string>>,
): readonly SpreadsheetColumn[] {
  return FREIGHT_REGION_EXPORT_COLUMNS.map((column) => {
    if (column === 'code') return { format: '@', header: header[column], width: 14 }
    if (column === 'name') return { header: header[column], width: 28 }
    if (column === 'cities') return { header: header[column], width: 60 }
    if (column === 'zone') return { align: 'right', format: '0', header: header[column], width: 10 }
    return { align: 'right', format: '#,##0.00', header: header[column], width: 14 }
  })
}

/** As mesmas células do CSV, com zona e valores como número para somar e ordenar na planilha. */
export function buildFreightRegionRows(
  regions: readonly FreightRegion[],
): readonly (readonly SpreadsheetCellValue[])[] {
  return regions.map((region) =>
    FREIGHT_REGION_EXPORT_COLUMNS.map((column) => {
      const text = readColumn({ column, region })
      return FREIGHT_REGION_TEXT_COLUMNS.has(column) ? text : toSpreadsheetNumber(text)
    }),
  )
}

export function buildFreightRegionCsv(
  input: Readonly<{
    header: Readonly<Record<FreightRegionExportColumn, string>>
    regions: readonly FreightRegion[]
  }>,
): string {
  const header = FREIGHT_REGION_EXPORT_COLUMNS.map((column) => escapeCsvField(input.header[column]))
  const rows = input.regions.map((region) =>
    FREIGHT_REGION_EXPORT_COLUMNS.map((column) =>
      escapeCsvField(readColumn({ column, region })),
    ).join(CSV_FIELD_SEPARATOR),
  )

  return `${CSV_BYTE_ORDER_MARK}${[header.join(CSV_FIELD_SEPARATOR), ...rows].join(CSV_LINE_SEPARATOR)}`
}

/** Uma cidade por linha: é o formato que cola direto no WhatsApp de quem vai combinar a viagem. */
export function buildFreightRegionCityList(regions: readonly FreightRegion[]): string {
  return regions.flatMap((region) => region.cities.map(describeCity)).join(CITY_LINE_SEPARATOR)
}
