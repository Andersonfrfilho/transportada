/* Copyright (c) 2026 Ada Technology. MIT License. */
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
export const FREIGHT_REGION_EXPORT_MEDIA_TYPE = 'text/csv;charset=utf-8'

/**
 * Ponto e vírgula, CRLF e BOM: é o que o Excel em pt-BR abre sem assistente de importação e sem
 * comer o acento. Vírgula como separador brigaria com a vírgula decimal do próprio valor.
 */
const FIELD_SEPARATOR = ';'
const LINE_SEPARATOR = '\r\n'
const BYTE_ORDER_MARK = '﻿'
const CITY_SEPARATOR = ', '
const CITY_LINE_SEPARATOR = '\n'
const QUOTE_PATTERN = /"/g

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

function escapeField(value: string): string {
  return `"${value.replace(QUOTE_PATTERN, '""')}"`
}

export function buildFreightRegionCsv(
  input: Readonly<{
    header: Readonly<Record<FreightRegionExportColumn, string>>
    regions: readonly FreightRegion[]
  }>,
): string {
  const header = FREIGHT_REGION_EXPORT_COLUMNS.map((column) => escapeField(input.header[column]))
  const rows = input.regions.map((region) =>
    FREIGHT_REGION_EXPORT_COLUMNS.map((column) => escapeField(readColumn({ column, region }))).join(
      FIELD_SEPARATOR,
    ),
  )

  return `${BYTE_ORDER_MARK}${[header.join(FIELD_SEPARATOR), ...rows].join(LINE_SEPARATOR)}`
}

/** Uma cidade por linha: é o formato que cola direto no WhatsApp de quem vai combinar a viagem. */
export function buildFreightRegionCityList(regions: readonly FreightRegion[]): string {
  return regions.flatMap((region) => region.cities.map(describeCity)).join(CITY_LINE_SEPARATOR)
}
