/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveCargoPlacement,
  STABLE_STACK_SLENDERNESS,
  type PlacedBox,
  type PlacementBox,
} from '../../src/trips/domain/cargo-placement.policy.js'

/**
 * Spec 116: **o vão mais estreito que o giro da pilha é apoio.**
 *
 * A pilha tomba girando em torno da aresta de baixo. Se a parede do outro lado de um vão está mais
 * perto do que o topo anda até o centro de massa passar da aresta — `3b/√10`, quase a base inteira —,
 * ela encosta antes de cair. Só a célula vizinha contava: a caixa presumida de 0,261 m deixava 7 cm até
 * a parede lateral do Atego, a coluna da parede era tratada como solta, e cada fileira subia em
 * pirâmide (8, 8, 8, 7, 7, 7, 6, 6, 6, 5 caixas por camada).
 *
 * ⚠️ As afirmações são de **propriedade** — até onde a coluna da borda sobe —, nunca a posição de uma
 * caixa. E valem as duas metades: o vão estreito segura, e o vão largo continua não segurando.
 */
const EPSILON = 1e-6
const BOX_BASE_M = 0.3

function cubes(count: number): PlacementBox[] {
  return [
    {
      count,
      heightMm: 210,
      isFragile: null,
      isStackable: null,
      keepUpright: null,
      label: 'P1',
      lengthMm: 300,
      maxStackCount: null,
      source: 'measured',
      stopSequence: 1,
      widthMm: 300,
    },
  ]
}

/** As caixas encostadas no lado do baú oposto à parede de partida — a coluna junto do vão. */
function sideColumnOf(widthM: string): readonly PlacedBox[] {
  const plan = resolveCargoPlacement({
    bed: { heightM: '2.300', lengthM: '2.400', source: 'measured', widthM },
    boxes: cubes(300),
    payloadRatio: null,
  })
  const boxes = (plan?.layers ?? []).flatMap((layer) => layer.boxes)
  expect(plan?.unplaced).toEqual([])
  const edgeM = Math.max(...boxes.map((box) => box.yM + box.widthM))

  return boxes.filter((box) => Math.abs(box.yM + box.widthM - edgeM) < EPSILON)
}

describe('vão lateral estreito segura a pilha (spec 116)', () => {
  test('com 7 cm até a parede, a coluna da borda sobe além de três vezes a base', () => {
    const side = sideColumnOf('2.470')
    const top = Math.max(...side.map((box) => box.zM + box.heightM))

    expect(top).toBeGreaterThan(BOX_BASE_M * STABLE_STACK_SLENDERNESS + EPSILON)
  })

  /**
   * ⚠️ O vão de 29 cm é maior que o giro de uma base de 30 cm (28,5 cm): a pilha passaria do ponto de
   * tombar antes de encostar. Ali a coluna da borda continua solta, e a trava de três vezes a base vale.
   */
  test('com vão maior que o giro da pilha, a coluna da borda continua solta', () => {
    for (const box of sideColumnOf('2.690')) {
      expect(box.zM + box.heightM).toBeLessThanOrEqual(
        BOX_BASE_M * STABLE_STACK_SLENDERNESS + EPSILON,
      )
    }
  })
})
