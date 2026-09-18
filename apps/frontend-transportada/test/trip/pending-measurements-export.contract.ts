/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  buildTripPendingMeasurementsCsv,
  buildTripPendingMeasurementsRows,
  buildTripPendingMeasurementsSheetData,
  TRIP_PENDING_MEASUREMENT_EXPORT_COLUMNS,
  tripPendingMeasurementsFileName,
  type TripPendingMeasurementsExportLabels,
} from '../../src/modules/trip/shared/tripPendingMeasurementsExport.service'
import type { TripPendingMeasurement } from '../../src/modules/trip/shared/trip.types'
import en from '../../src/modules/trip/locales/trip.en.locale.json'
import trip from '../../src/modules/trip/locales/trip.locale.json'

const PENDING_MEASUREMENTS = new URL(
  '../../src/modules/trip/components/TripPendingMeasurements.component.tsx',
  import.meta.url,
)

const LABELS: TripPendingMeasurementsExportLabels = {
  emptyValue: '—',
  estimateSourceLabel: (source) => `origem:${source}`,
  header: {
    boxCount: 'Caixas',
    document: 'Documento',
    estimateSource: 'Origem da medida',
    product: 'Produto',
    stop: 'Parada',
  },
  unknownProduct: 'Produto sem identificação',
}

const WITH_LABEL: TripPendingMeasurement = {
  boxCount: 6,
  documentNumber: '111',
  estimateSource: 'note',
  label: 'Caneta',
  productCode: 'P1',
  sequence: 1,
  stopLabel: 'Barrinha',
}

const WITHOUT_LABEL: TripPendingMeasurement = {
  boxCount: 2,
  documentNumber: null,
  estimateSource: 'none',
  label: null,
  productCode: null,
  sequence: 2,
  stopLabel: 'Fazenda, "Boa Vista"',
}

/**
 * Spec de exportação do painel "O que falta medir": as mesmas colunas e os mesmos textos que a
 * tabela mostra viram CSV e planilha, dois botões lado a lado do atalho "Ir para a fila de medição".
 */
describe('exportar o que falta medir em CSV/Excel', () => {
  it('a linha reproduz os mesmos fallbacks da tabela — rótulo, "—" e produto sem identificação', () => {
    const rows = buildTripPendingMeasurementsRows({
      labels: LABELS,
      measurements: [WITH_LABEL, WITHOUT_LABEL],
    })

    expect(rows[0]).toEqual(['Caneta', '111', 'Barrinha', 6, 'origem:note'])
    expect(rows[1]).toEqual([
      'Produto sem identificação',
      '—',
      'Fazenda, "Boa Vista"',
      2,
      'origem:none',
    ])
  })

  it('o cabeçalho do CSV e da planilha usa as mesmas colunas, na mesma ordem', () => {
    const sheetData = buildTripPendingMeasurementsSheetData({ labels: LABELS, measurements: [] })

    expect(sheetData[0]).toEqual(
      TRIP_PENDING_MEASUREMENT_EXPORT_COLUMNS.map((column) => LABELS.header[column]),
    )
  })

  it('a contagem de caixas chega como número na planilha, não como texto', () => {
    const sheetData = buildTripPendingMeasurementsSheetData({
      labels: LABELS,
      measurements: [WITH_LABEL],
    })

    expect(typeof sheetData[1]?.[3]).toBe('number')
  })

  it('o CSV tem BOM, separador `;` e escapa aspas/vírgula do rótulo da parada', () => {
    const csv = buildTripPendingMeasurementsCsv({ labels: LABELS, measurements: [WITHOUT_LABEL] })

    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toInclude('"Fazenda, ""Boa Vista"""')
    expect(csv).toInclude('"Produto sem identificação";"—"')
  })

  it('o nome do arquivo leva a data, sem dado pessoal', () => {
    expect(tripPendingMeasurementsFileName({ extension: 'csv', today: '2026-09-18' })).toBe(
      'medidas-pendentes-viagem-2026-09-18.csv',
    )
    expect(tripPendingMeasurementsFileName({ extension: 'xlsx', today: '2026-09-18' })).toBe(
      'medidas-pendentes-viagem-2026-09-18.xlsx',
    )
  })

  it('o painel tem os dois botões de download ao lado do atalho para a fila', () => {
    const source = readFileSync(PENDING_MEASUREMENTS, 'utf8')

    expect(source).toInclude("t('pendingMeasurement.export.csv')")
    expect(source).toInclude("t('pendingMeasurement.export.xlsx')")
    expect(source).toInclude("import('write-excel-file/browser')")
  })

  it('os rótulos dos botões existem em pt e em en', () => {
    expect(trip.pendingMeasurement.export.csv).toBeString()
    expect(trip.pendingMeasurement.export.xlsx).toBeString()
    expect(en.pendingMeasurement.export.csv).toBeString()
    expect(en.pendingMeasurement.export.xlsx).toBeString()
  })
})
