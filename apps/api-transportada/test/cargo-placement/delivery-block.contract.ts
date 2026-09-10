import { describe, expect, test } from 'bun:test'

import {
  resolveCargoPlacement,
  type PlacedBox,
  type PlacementBox,
} from '../../src/trips/domain/cargo-placement.policy.js'

/**
 * Spec 114: em profundidade a carga é um bloco só, preenchido pela ordem de entrega. As afirmações são
 * de **propriedade** — dentro do baú, ninguém some, a ordem de descarga vale —, nunca a reconstrução
 * da posição de uma caixa.
 */
const BED = { heightM: '2.200', lengthM: '5.320', source: 'measured' as const, widthM: '2.080' }
const EPSILON = 1e-6

function stops(count: number, perStop: (index: number) => number): PlacementBox[] {
  return Array.from({ length: count }, (_, index) => ({
    count: perStop(index),
    heightMm: 250,
    isFragile: false,
    isStackable: true,
    keepUpright: false,
    label: `P${index + 1}`,
    lengthMm: 400,
    maxStackCount: null,
    source: 'measured' as const,
    stopSequence: index + 1,
    widthMm: 300,
  }))
}

function placedOf(boxes: readonly PlacementBox[], payloadRatio: string | null = null): PlacedBox[] {
  const plan = resolveCargoPlacement({ arrangement: 'depth', bed: BED, boxes, payloadRatio })
  return plan?.layers.flatMap((layer) => layer.boxes) ?? []
}

function overlaps(fromA: number, sizeA: number, fromB: number, sizeB: number): boolean {
  return fromA < fromB + sizeB - EPSILON && fromB < fromA + sizeA - EPSILON
}

/** 85 paradas de 1 a 5 caixas: o caso medido em que 38 paradas saíam do desenho. */
const MANY_SMALL = stops(85, (index) => 1 + ((index * 7) % 5))

describe('um bloco só, pela ordem de entrega (spec 114)', () => {
  test('toda caixa fica dentro do baú', () => {
    const boxes = placedOf(MANY_SMALL)

    expect(boxes.length).toBeGreaterThan(0)
    for (const entry of boxes) {
      expect(entry.xM).toBeGreaterThanOrEqual(-EPSILON)
      expect(entry.xM + entry.depthM).toBeLessThanOrEqual(5.32 + EPSILON)
      expect(entry.yM + entry.widthM).toBeLessThanOrEqual(2.08 + EPSILON)
      expect(entry.zM + entry.heightM).toBeLessThanOrEqual(2.2 + EPSILON)
    }
  })

  test('nenhuma parada fica fora do desenho quando o volume cabe', () => {
    const plan = resolveCargoPlacement({ arrangement: 'depth', bed: BED, boxes: MANY_SMALL })
    const drawn = new Set(plan?.layers.flatMap((layer) => layer.boxes.map((b) => b.stopSequence)))

    expect(plan?.unplaced).toEqual([])
    expect(drawn.size).toBe(85)
  })

  test('entrega mais tardia nunca fica em cima de uma mais cedo', () => {
    const boxes = placedOf(MANY_SMALL)
    const above = boxes.filter((later) =>
      boxes.some(
        (earlier) =>
          earlier.stopSequence < later.stopSequence &&
          overlaps(later.xM, later.depthM, earlier.xM, earlier.depthM) &&
          overlaps(later.yM, later.widthM, earlier.yM, earlier.widthM) &&
          later.zM >= earlier.zM + earlier.heightM - EPSILON,
      ),
    )

    expect(above).toEqual([])
  })

  test('entrega mais tardia nunca fica entre uma mais cedo e a porta', () => {
    const boxes = placedOf(MANY_SMALL)
    const blocking = boxes.filter((later) =>
      boxes.some(
        (earlier) =>
          earlier.stopSequence < later.stopSequence &&
          overlaps(later.yM, later.widthM, earlier.yM, earlier.widthM) &&
          overlaps(later.zM, later.heightM, earlier.zM, earlier.heightM) &&
          later.xM >= earlier.xM + earlier.depthM - EPSILON,
      ),
    )

    expect(blocking).toEqual([])
  })

  test('a pilha cercada sobe além da trava de coluna livre', () => {
    const tallest = Math.max(...placedOf(MANY_SMALL).map((entry) => entry.zM + entry.heightM))

    expect(tallest).toBeGreaterThan(0.3 * 3 + EPSILON)
  })

  test('carga leve termina na porta', () => {
    const boxes = placedOf(MANY_SMALL)
    const doorEnd = Math.max(...boxes.map((entry) => entry.xM + entry.depthM))

    expect(doorEnd).toBeCloseTo(5.32, 2)
  })
})
