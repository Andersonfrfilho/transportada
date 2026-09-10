/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { resolveCargoLayout } from '../../src/trips/domain/cargo-layout.policy.js'
import {
  resolveCargoPlacement,
  type PlacedBox,
  type PlacementBox,
} from '../../src/trips/domain/cargo-placement.policy.js'
import { buildCargoPreviewStops } from '../../src/trips/domain/cargo-preview.policy.js'
import {
  ACCELO_24_STOPS,
  ATEGO_85_STOPS,
  type RealCargoRow,
} from '../fixtures/real-mixed-cargo.fixture.js'

/**
 * Spec 119: a caixa da planta sabe de que nota veio, e é isso que deixa a tela dar um tom por nota.
 *
 * ⚠️ **A nota é carona, nunca critério.** O empacotador só copia os dois campos: nenhuma posição
 * pode mudar por causa deles, e é essa a afirmação mais forte daqui — conferida nas duas cargas reais
 * de 2026-09-10, onde um desempate que lesse a nota apareceria.
 */
function toBoxes(rows: readonly RealCargoRow[], withNotes: boolean): PlacementBox[] {
  return rows.map(([stopSequence, count, lengthMm, widthMm, heightMm, measured], index) => ({
    count,
    heightMm,
    isFragile: null,
    isStackable: null,
    keepUpright: null,
    label: `P${String(stopSequence)}`,
    lengthMm,
    maxStackCount: null,
    source: measured === 1 ? ('measured' as const) : ('estimated' as const),
    stopSequence,
    widthMm,
    ...(withNotes
      ? {
          documentId: `doc-${String(stopSequence)}-${String(index % 3)}`,
          documentNumber: `${String(stopSequence)}0${String(index % 3)}`,
        }
      : {}),
  }))
}

type Bed = Readonly<{ heightM: string; lengthM: string; source: 'measured'; widthM: string }>

function placedOf(rows: readonly RealCargoRow[], withNotes: boolean, bed: Bed) {
  const plan = resolveCargoPlacement({ bed, boxes: toBoxes(rows, withNotes), payloadRatio: '0.9' })
  if (plan === null) throw new Error('a planta devia existir com o baú medido')

  return plan
}

function positionOf(box: PlacedBox) {
  return Object.fromEntries(
    Object.entries(box).filter(([key]) => key !== 'documentId' && key !== 'documentNumber'),
  )
}

const ATEGO_BED: Bed = { heightM: '2.300', lengthM: '7.400', source: 'measured', widthM: '2.470' }
const ACCELO_BED: Bed = { heightM: '2.200', lengthM: '5.320', source: 'measured', widthM: '2.080' }

describe('cargo placement note identity contract (spec 119)', () => {
  test('carries the note of every drawn box, inside the stop that owns the note', () => {
    for (const [rows, bed] of [
      [ACCELO_24_STOPS, ACCELO_BED],
      [ATEGO_85_STOPS, ATEGO_BED],
    ] as const) {
      const boxes = placedOf(rows, true, bed).layers.flatMap((layer) => layer.boxes)

      expect(boxes.length).toBeGreaterThan(0)
      for (const box of boxes) {
        expect(box.documentId).toStartWith(`doc-${String(box.stopSequence)}-`)
        expect(box.documentNumber).toStartWith(`${String(box.stopSequence)}0`)
      }
    }
  })

  test('moves no box when the notes are present', () => {
    for (const [rows, bed] of [
      [ACCELO_24_STOPS, ACCELO_BED],
      [ATEGO_85_STOPS, ATEGO_BED],
    ] as const) {
      const withNotes = placedOf(rows, true, bed)
      const without = placedOf(rows, false, bed)

      expect(withNotes.layers.map((layer) => layer.boxes.map(positionOf))).toEqual(
        without.layers.map((layer) => layer.boxes.map(positionOf)),
      )
      expect(withNotes.unplaced).toEqual(without.unplaced)
      expect(withNotes.source).toBe(without.source)
    }
  })

  /** Caixa sem nota conhecida é ausência dita, nunca nota inventada. */
  test('publishes null when the note is unknown', () => {
    const boxes = placedOf(ACCELO_24_STOPS.slice(0, 20), false, ACCELO_BED).layers.flatMap(
      (layer) => layer.boxes,
    )

    expect(boxes.length).toBeGreaterThan(0)
    for (const box of boxes) {
      expect(box.documentId).toBeNull()
      expect(box.documentNumber).toBeNull()
    }
  })

  /** A planta da prévia sai de `resolveCargoLayout`, e é por ela que a nota tem de atravessar. */
  test('keeps the note through the layout, box by box', () => {
    const layout = resolveCargoLayout({
      bedDimensions: { heightM: '1.800', lengthM: '4.200', source: 'measured', widthM: '2.100' },
      capacityM3: '15.876000',
      fallbackBoxVolumeM3: 0.02,
      loadingAccess: 'rear',
      measuredShapes: [],
      payloadRatio: null,
      stops: [
        {
          boxes: [
            {
              count: 2,
              documentId: 'nota-a',
              documentNumber: '101',
              heightMm: 300,
              lengthMm: 400,
              widthMm: 300,
            },
            {
              count: 3,
              documentId: 'nota-b',
              documentNumber: '102',
              heightMm: 200,
              lengthMm: 300,
              widthMm: 200,
            },
          ],
          clientName: 'Cliente',
          documentsWithoutVolume: 0,
          label: 'Parada 1',
          noteNumbers: ['101', '102'],
          sequence: 1,
          volumeM3: '0.500000',
        },
        {
          boxes: [{ count: 4, heightMm: 250, lengthMm: 350, widthMm: 250 }],
          clientName: 'Outro',
          documentsWithoutVolume: 0,
          label: 'Parada 2',
          noteNumbers: [],
          sequence: 2,
          volumeM3: '0.400000',
        },
      ],
    })
    const boxes = layout?.placement?.layers.flatMap((layer) => layer.boxes) ?? []
    const byNote = (id: string | null) => boxes.filter((box) => box.documentId === id)

    expect(byNote('nota-a').map((box) => box.stopSequence)).toEqual([1, 1])
    expect(byNote('nota-b').map((box) => box.stopSequence)).toEqual([1, 1, 1])
    expect(byNote('nota-a').every((box) => box.documentNumber === '101')).toBe(true)
    expect(byNote(null).map((box) => box.stopSequence)).toEqual([2, 2, 2, 2])
  })

  /** A prévia carimba a nota onde as caixas viram da parada — nunca num mapa ao lado. */
  test('stamps the note on the boxes where the preview groups them by stop', () => {
    const stops = buildCargoPreviewStops({
      boxesByDocument: new Map([
        ['nota-a', [{ count: 1, heightMm: 100, lengthMm: 100, widthMm: 100 }]],
        ['nota-b', [{ count: 2, heightMm: 100, lengthMm: 100, widthMm: 100 }]],
      ]),
      documents: [
        {
          addressKey: 'k',
          label: 'Loja',
          nfeDocumentId: 'nota-a',
          number: '7',
          volumeM3: null,
          weightKilograms: null,
        },
        {
          addressKey: 'k',
          label: 'Loja',
          nfeDocumentId: 'nota-b',
          volumeM3: null,
          weightKilograms: null,
        },
      ],
      order: [],
    })

    expect(stops[0]?.boxes?.map((entry) => [entry.documentId, entry.documentNumber])).toEqual([
      ['nota-a', '7'],
      ['nota-b', null],
    ])
  })

  /** O detalhe da viagem carimba pela mesma chave, na mesma volta que agrupa as caixas da parada. */
  test('stamps the note in the trip detail too', () => {
    const source = readFileSync(
      new URL('../../src/trips/infrastructure/drizzle-trip.repository.ts', import.meta.url),
      'utf8',
    )

    expect(source).toContain('documentId: document.nfeDocumentId')
  })
})
