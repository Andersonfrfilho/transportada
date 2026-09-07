/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'

const validation = createTripResponseAdapters()

const SLICE = {
  boxesToMeasure: 0,
  depthM: '1.000',
  distanceFromDoorM: '2.900',
  label: 'Barrinha',
  layers: { boxCount: 40, boxesPerLayer: 25, layers: 2 },
  loadOrder: 3,
  sequence: 1,
  share: '0.1124',
  volumeM3: '6.000000',
}

const LAYOUT = {
  bedLengthM: '8.900',
  bedWidthM: '2.500',
  freeDepthM: '2.900',
  freeRows: 6,
  occupancyKnown: true,
  orderIsBinding: true,
  overflowDepthM: '0.000',
  overflowM3: '0.000000',
  rows: [{ label: 'Barrinha', loadOrder: 3, sequence: 1, sideReachable: false }],
  slices: [SLICE],
  stopsWithoutVolume: [],
}

function readLayout(overrides: Record<string, unknown>) {
  return validation.tripCargoPreviewFromApi({
    cargoLayout: { ...LAYOUT, ...overrides },
    cargoWeight: null,
    occupancy: null,
    weightConcentration: null,
  }).cargoLayout
}

/**
 * Spec 088 G002: o metro atravessa o fio. A ausência é o caso normal — 8 de 8 veículos estão sem
 * medida —, então o guard tem de aceitar `null` sem derrubar as fileiras proporcionais da 085.
 */
describe('a profundidade da faixa chega do servidor (spec 088)', () => {
  it('lê o comprimento do baú, o espaço livre e o excedente em metros', () => {
    const layout = readLayout({})

    expect(layout?.bedLengthM).toBe('8.900')
    expect(layout?.freeDepthM).toBe('2.900')
    expect(layout?.overflowDepthM).toBe('0.000')
    expect(layout?.slices[0]?.depthM).toBe('1.000')
    expect(layout?.slices[0]?.distanceFromDoorM).toBe('2.900')
    expect(layout?.slices[0]?.layers).toEqual({ boxCount: 40, boxesPerLayer: 25, layers: 2 })
  })

  /** Spec 088 R4: parada com uma caixa por medir chega sem camada, e a faixa mostra só o metro. */
  it('aceita a faixa sem camada, que é a parada com caixa por medir', () => {
    const layout = readLayout({ slices: [{ ...SLICE, layers: null }] })

    expect(layout?.slices[0]?.layers).toBeNull()
    expect(layout?.slices[0]?.depthM).toBe('1.000')
  })

  /** Baú sem medida continua desenhando as fileiras: o metro some, o desenho da 085 fica. */
  it('aceita o baú sem medida e mantém as fileiras', () => {
    const layout = readLayout({
      bedLengthM: null,
      bedWidthM: null,
      freeDepthM: null,
      overflowDepthM: null,
      slices: [{ ...SLICE, depthM: null, distanceFromDoorM: null }],
    })

    expect(layout?.bedLengthM).toBeNull()
    expect(layout?.rows).toHaveLength(1)
  })

  /** ⚠️ Negativa é a carga que atravessou a porta, e ela precisa chegar inteira até o desenho. */
  it('deixa passar a distância negativa de quem não coube', () => {
    const layout = readLayout({
      freeDepthM: '0.000',
      overflowDepthM: '1.100',
      slices: [{ ...SLICE, distanceFromDoorM: '-1.100' }],
    })

    expect(layout?.slices[0]?.distanceFromDoorM).toBe('-1.100')
    expect(layout?.overflowDepthM).toBe('1.100')
  })

  /** Metro que não é texto é recusa: um número solto ali viraria uma planta em escala errada. */
  it('recusa o comprimento do baú fora do formato', () => {
    expect(() => readLayout({ bedLengthM: 8.9 })).toThrow()
  })
})
