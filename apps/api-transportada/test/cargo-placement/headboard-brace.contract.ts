/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveCargoPlacement,
  STABLE_STACK_SLENDERNESS,
  type CargoPlacement,
  type PlacedBox,
  type PlacementBox,
} from '../../src/trips/domain/cargo-placement.policy.js'
import { simulateUnloading } from './unloading-simulation.js'

/**
 * Spec 134: **a carga fica encostada na cabeceira quando a testeira a escora.**
 *
 * ⚠️ Em profundidade o bloco é empacotado encostado na testeira — que conta como parede — e depois
 * deslocado para a porta (099 D2) ou para o meio (099 D3). A pilha alta da última entrega se escora na
 * testeira; deslocada além do giro dela (`3b/√10`), fica solta. Medido com o juiz corrigido da spec 133:
 * 15 caixas na Sprinter real, 15 no Accelo, e 6 nesta carga sintética em qualquer teto de massa.
 *
 * As afirmações são de **propriedade** — ninguém perde apoio, a pilha exposta à testeira fica dentro do
 * giro com 1 cm de sobra, e a 099 continua valendo onde a testeira não escora nada —, nunca a posição
 * de uma caixa.
 */
const SPRINTER_BED = {
  heightM: '1.900',
  lengthM: '3.400',
  source: 'measured',
  widthM: '1.780',
} as const
const HEADBOARD_BRACE_MARGIN_M = 0.01
const EPSILON = 1e-6

function presumed(stopSequence: number, count: number): PlacementBox {
  return {
    count,
    heightMm: 210,
    isFragile: null,
    isStackable: null,
    keepUpright: null,
    label: `P${String(stopSequence)}`,
    lengthMm: 371,
    maxStackCount: null,
    source: 'estimated',
    stopSequence,
    widthMm: 261,
  }
}

function place(input: Readonly<{ count: number; payloadRatio: string | null; stops: number }>) {
  const plan = resolveCargoPlacement({
    bed: SPRINTER_BED,
    boxes: Array.from({ length: input.stops }, (_, index) => presumed(index + 1, input.count)),
    payloadRatio: input.payloadRatio,
  })
  if (plan === null) throw new Error('a Sprinter tem baú medido')

  return plan
}

function drawnOf(plan: CargoPlacement): PlacedBox[] {
  return plan.layers.flatMap((layer) => layer.boxes)
}

function overlaps(fromA: number, sizeA: number, fromB: number, sizeB: number): boolean {
  return fromA < fromB + sizeB - EPSILON && fromB < fromA + sizeA - EPSILON
}

/** A pilha mais alta que três bases que não tem nada entre ela e a testeira — só a testeira a segura. */
function leansOnHeadboard(box: PlacedBox, boxes: readonly PlacedBox[]): boolean {
  const baseM = Math.min(box.depthM, box.widthM)
  if (box.zM + box.heightM <= baseM * STABLE_STACK_SLENDERNESS + EPSILON) return false

  return !boxes.some(
    (other) =>
      other !== box &&
      other.xM + other.depthM <= box.xM + EPSILON &&
      overlaps(box.yM, box.widthM, other.yM, other.widthM) &&
      overlaps(box.zM, box.heightM, other.zM, other.heightM),
  )
}

function catchGapOf(box: PlacedBox): number {
  const baseM = Math.min(box.depthM, box.widthM)
  return (baseM * STABLE_STACK_SLENDERNESS) / Math.hypot(STABLE_STACK_SLENDERNESS, 1)
}

const BED = { heightM: 1.9, lengthM: 3.4, widthM: 1.78 }

describe('a carga encostada na cabeceira (spec 134)', () => {
  test.each([null, '0.3000', '0.8000'])(
    '12 entregas × 6 presumidas, teto de massa %p: ninguém perde a escora da testeira',
    (payloadRatio) => {
      const plan = place({ count: 6, payloadRatio, stops: 12 })

      expect(drawnOf(plan).length).toBe(72)
      expect(simulateUnloading(plan, BED).unsupported).toEqual([])
    },
  )

  test.each([null, '0.3000', '0.8000'])(
    'a pilha que só a testeira segura fica dentro do giro, com 1 cm de sobra (teto %p)',
    (payloadRatio) => {
      const boxes = drawnOf(place({ count: 6, payloadRatio, stops: 12 }))
      const leaning = boxes.filter((box) => leansOnHeadboard(box, boxes))

      /** O caso exercita a testeira de fato: sem pilha escorada nela, a afirmação seria vazia. */
      expect(leaning.length).toBeGreaterThan(0)
      expect(
        leaning.filter((box) => box.xM > catchGapOf(box) - HEADBOARD_BRACE_MARGIN_M + EPSILON),
      ).toEqual([])
    },
  )

  /**
   * ⚠️ Onde a testeira não escora nada, a 099 D2 vale como sempre: três caixas empilhadas ficam abaixo de
   * três bases, e a carga termina na porta — o vão sobra na testeira, onde não atrapalha a descarga.
   */
  test('carga baixa, que a testeira não escora, termina na porta', () => {
    const boxes = drawnOf(place({ count: 3, payloadRatio: null, stops: 1 }))

    expect(Math.max(...boxes.map((box) => box.xM + box.depthM))).toBeCloseTo(3.4, 6)
  })
})
