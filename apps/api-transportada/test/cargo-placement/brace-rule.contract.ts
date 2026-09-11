/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { CargoPlacement, PlacedBox } from '../../src/trips/domain/cargo-placement.policy.js'
import { simulateUnloading, type UnloadingBed } from './unloading-simulation.js'

/**
 * **O juiz da descarga só aceita escora de quem encosta na face pelo lado** (spec 135, decisão do
 * usuário).
 *
 * ⚠️ A caixa mais larga embaixo de uma pilha passa da face dela e chega à altura da contenção — no mapa
 * era "carga ao lado", e a pilha se escorava nela mesma. Medido na linha `ce0a2d08`: 10, 58, 99 e 26
 * caixas das quatro viagens reais escoradas só no próprio degrau. Três regras, cada uma com o caso que
 * a derruba:
 *
 * - a caixa embaixo dela no plano **sustenta, não escora**;
 * - escora é quem encosta na face por pelo menos `MIN_BRACE_CONTACT_M` (1 cm) — a quina não segura;
 * - e quem sobe ao lado dela por pelo menos `MIN_BRACE_HEIGHT_M` (1 cm) — a lâmina não segura.
 *
 * As afirmações são sobre **a caixa do meio**: as vizinhas desta planta também são colunas altas e podem
 * sair sem apoio, e isso não é o que se confere aqui.
 */
const BED: UnloadingBed = { heightM: 2, lengthM: 3, widthM: 1.8 }

const CUBE_M = 0.3

type HandBox = Readonly<{
  depthM: number
  heightM: number
  widthM: number
  xM: number
  yM: number
  zM: number
}>

function handBuilt(boxes: readonly HandBox[]): CargoPlacement {
  return {
    layers: [
      {
        boxes: boxes.map(
          (box): PlacedBox => ({
            ...box,
            documentId: null,
            documentNumber: null,
            isFragile: false,
            label: 'P1',
            layer: 0,
            reasons: ['lastStopFirst'],
            source: 'measured',
            stopSequence: 1,
          }),
        ),
        heightM: CUBE_M,
        index: 0,
      },
    ],
    source: 'measured',
    unplaced: [],
  }
}

/** Uma laje de 0,90 m, mais larga que o cubo em todos os lados, longe das paredes. */
const STEP: HandBox = { depthM: 1.2, heightM: 0.9, widthM: 1.2, xM: 0.9, yM: 0.3, zM: 0 }

/** O cubo em cima da laje: o topo a 1,20 m passa de três vezes a base de 30 cm. */
const CENTER: HandBox = {
  depthM: CUBE_M,
  heightM: CUBE_M,
  widthM: CUBE_M,
  xM: 1.35,
  yM: 0.75,
  zM: 0.9,
}

/** As quatro vizinhas encostadas nas faces do cubo, em cima da mesma laje. */
function neighboursOf(center: HandBox): readonly HandBox[] {
  return [
    { ...center, xM: center.xM - CUBE_M },
    { ...center, xM: center.xM + CUBE_M },
    { ...center, yM: center.yM - CUBE_M },
    { ...center, yM: center.yM + CUBE_M },
  ]
}

function isCenterUnsupported(boxes: readonly HandBox[]): boolean {
  return simulateUnloading(handBuilt(boxes), BED).unsupported.some(
    ({ box }) =>
      Math.abs(box.xM - CENTER.xM) < 1e-9 &&
      Math.abs(box.yM - CENTER.yM) < 1e-9 &&
      Math.abs(box.zM - CENTER.zM) < 1e-9,
  )
}

describe('a escora do juiz é encosto pelo lado (spec 135)', () => {
  test('a laje embaixo do cubo sustenta, mas não o escora', () => {
    expect(isCenterUnsupported([STEP, CENTER])).toBe(true)
  })

  test('com as quatro vizinhas encostadas nas faces, o cubo está escorado', () => {
    expect(isCenterUnsupported([STEP, CENTER, ...neighboursOf(CENTER)])).toBe(false)
  })

  test('a vizinha que só encosta 5 mm na face não escora', () => {
    const [back, front, left, right] = neighboursOf(CENTER)
    const corner = { ...(front as HandBox), yM: CENTER.yM - CUBE_M + 0.005 }

    expect(
      isCenterUnsupported([
        STEP,
        CENTER,
        back as HandBox,
        corner,
        left as HandBox,
        right as HandBox,
      ]),
    ).toBe(true)
  })

  test('a lâmina de 5 mm ao lado do cubo não sobe o bastante, e não escora', () => {
    const [back, , left, right] = neighboursOf(CENTER)
    const flat: HandBox = { ...CENTER, heightM: 0.005, xM: CENTER.xM + CUBE_M }

    expect(
      isCenterUnsupported([STEP, CENTER, back as HandBox, flat, left as HandBox, right as HandBox]),
    ).toBe(true)
  })
})
