/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'
import en from '../../src/modules/trip/locales/trip.en.locale.json'
import trip from '../../src/modules/trip/locales/trip.locale.json'

const validation = createTripResponseAdapters()

const PANEL = new URL(
  '../../src/modules/trip/components/TripCargoPanel.component.tsx',
  import.meta.url,
)
const PENDING_MEASUREMENTS = new URL(
  '../../src/modules/trip/components/TripPendingMeasurements.component.tsx',
  import.meta.url,
)

const SLICE = {
  boxesToMeasure: 0,
  depthM: '1.000',
  distanceFromDoorM: '2.900',
  label: 'Barrinha',
  layers: null,
  loadOrder: 3,
  sequence: 1,
  share: '0.1124',
  volumeM3: '6.000000',
}

const LAYOUT = {
  bedLengthM: null,
  bedSource: null,
  bedWidthM: null,
  freeDepthM: null,
  freeRows: 6,
  occupancyKnown: true,
  orderIsBinding: true,
  overflowDepthM: null,
  overflowM3: '0.000000',
  rows: [{ label: 'Barrinha', loadOrder: 3, sequence: 1, sideReachable: false }],
  slices: [SLICE],
  stopsWithoutVolume: [],
}

const PENDING_MEASUREMENT = {
  boxCount: 6,
  documentNumber: '111',
  estimateSource: 'note',
  grossWeightGrams: null,
  label: 'Caneta',
  packageBoxId: 'box-1',
  productCode: 'P1',
  sequence: 1,
  stopLabel: 'Barrinha',
  unitsPerBox: 1,
} as const

function readLayout(overrides: Record<string, unknown>) {
  return validation.tripCargoPreviewFromApi({
    cargoLayout: { ...LAYOUT, ...overrides },
    cargoWeight: null,
    occupancy: null,
    weightConcentration: null,
  }).cargoLayout
}

/**
 * G004/G005 (spec 144, D4): a lista do que falta medir chega pela prévia e pelo detalhe da viagem,
 * e a tela dá um atalho até a fila de medição da 085 — sem isso o operador lê "falta medir" e não
 * sabe aonde ir.
 */
describe('a lista do que falta medir na tela (spec 144 D4)', () => {
  it('aceita pendingMeasurements ausente, como uma API anterior o serviria', () => {
    const layout = readLayout({})

    expect(layout?.pendingMeasurements).toBeUndefined()
  })

  it('lê a lista do que falta medir da prévia', () => {
    const layout = readLayout({ pendingMeasurements: [PENDING_MEASUREMENT] })

    expect(layout?.pendingMeasurements).toEqual([PENDING_MEASUREMENT])
  })

  it('recusa item da lista fora do formato', () => {
    expect(() =>
      readLayout({ pendingMeasurements: [{ ...PENDING_MEASUREMENT, boxCount: '6' }] }),
    ).toThrow()
  })

  it('recusa estimateSource fora do vocabulário conhecido', () => {
    expect(() =>
      readLayout({
        pendingMeasurements: [{ ...PENDING_MEASUREMENT, estimateSource: 'guess' }],
      }),
    ).toThrow()
  })

  it('o painel de carga monta a lista do que falta medir', () => {
    const source = readFileSync(PANEL, 'utf8')

    expect(source).toInclude('<TripPendingMeasurements')
    expect(source).toInclude('layout')
  })

  it('a lista tem um atalho para a fila de medição da 085', () => {
    const source = readFileSync(PENDING_MEASUREMENTS, 'utf8')

    expect(source).toInclude('navigateToPackageBoxQueue')
    expect(source).toInclude("t('pendingMeasurement.goToQueue')")
  })

  it('cada procedência tem rótulo em pt e em en', () => {
    for (const source of ['note', 'median', 'none'] as const) {
      expect(trip.pendingMeasurement.estimateSource[source]).toBeString()
      expect(en.pendingMeasurement.estimateSource[source]).toBeString()
    }
  })
})
