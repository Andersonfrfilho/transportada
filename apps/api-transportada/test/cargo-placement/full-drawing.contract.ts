/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveCargoPlacement,
  type PlacementBox,
} from '../../src/trips/domain/cargo-placement.policy.js'

/**
 * Spec 131: **não há teto de desenho.** O que o empacotador pôs no baú vai inteiro para a planta que
 * a tela recebe. O teto de 1500 da spec 115 aparava a planta pela caixa mais alta e a tela dizia
 * "fora do desenho por limite de detalhe" — carga que está no baú, escondida porque o SVG ficava
 * lento. Desenho lento é defeito do desenho, e é corrigido lá.
 */
const POLICY_PATH = new URL('../../src/trips/domain/cargo-placement.policy.ts', import.meta.url)

/** Baú de truck medido — o do Atego real: 7,40 × 2,47 × 2,30 m. */
const BED = { heightM: '2.300', lengthM: '7.400', source: 'measured' as const, widthM: '2.470' }

function cubes(input: { count: number; sideMm: number; stops: number }): PlacementBox[] {
  return Array.from({ length: input.stops }, (_, index) => ({
    count: input.count,
    heightMm: input.sideMm,
    isFragile: null,
    isStackable: null,
    keepUpright: null,
    label: `CAIXA ${String(index + 1)}`,
    lengthMm: input.sideMm,
    maxStackCount: null,
    source: 'measured' as const,
    stopSequence: index + 1,
    weightGrams: null,
    widthMm: input.sideMm,
  }))
}

function countDrawn(plan: NonNullable<ReturnType<typeof resolveCargoPlacement>>): number {
  return plan.layers.reduce((total, layer) => total + layer.boxes.length, 0)
}

describe('spec 131 — toda caixa empacotada é desenhada', () => {
  /**
   * ⚠️ A soma é a prova: desenhadas + o que ficou fora por motivo **físico** fecha o pedido, e nenhum
   * motivo é "limite de detalhe". 6000 caixas é quatro vezes o antigo teto.
   */
  test('6000 caixas de 12 cm em 60 entregas voltam todas desenhadas', () => {
    const plan = resolveCargoPlacement({
      bed: BED,
      boxes: cubes({ count: 100, sideMm: 120, stops: 60 }),
      payloadRatio: null,
    })

    expect(plan).not.toBeNull()
    if (plan === null) return
    const left = plan.unplaced.reduce((total, entry) => total + entry.count, 0)
    expect(plan.unplaced.filter((entry) => entry.reason === 'tooMany')).toEqual([])
    expect(countDrawn(plan) + left).toBe(6000)
    expect(countDrawn(plan)).toBeGreaterThan(1500)
  })

  /** O teto não pode voltar por outro nome: nenhuma poda da planta depois do empacotamento. */
  test('a política não apara a planta depois de empacotar', async () => {
    const source = await Bun.file(POLICY_PATH).text()

    expect(source).not.toContain('MAX_DRAWN_BOXES')
    expect(source).not.toContain('trimForDrawing')
  })
})
