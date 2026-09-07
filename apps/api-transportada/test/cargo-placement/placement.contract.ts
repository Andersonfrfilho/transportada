/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveCargoPlacement,
  type PlacementBox,
} from '../../src/trips/domain/cargo-placement.policy.js'

/** Baú de truck medido: 7,40 × 2,47 × 2,30 m — o mesmo da frota de teste. */
const BED = { heightM: '2.300', lengthM: '7.400', widthM: '2.470' } as const

function box(overrides: Partial<PlacementBox>): PlacementBox {
  return {
    count: 1,
    heightMm: 400,
    isFragile: null,
    isStackable: null,
    keepUpright: null,
    label: 'CAIXA',
    lengthMm: 600,
    maxStackCount: null,
    source: 'measured',
    stopSequence: 1,
    widthMm: 400,
    ...overrides,
  }
}

describe('empacotamento da carga (spec 094)', () => {
  test('posiciona a caixa no piso, encostada no fundo', () => {
    const plan = resolveCargoPlacement({ bed: BED, boxes: [box({})] })

    expect(plan?.layers).toHaveLength(1)
    expect(plan?.layers[0]?.boxes[0]).toMatchObject({ depthM: 0.6, layer: 0, widthM: 0.4, xM: 0 })
  })

  /**
   * ⚠️ A **última parada viaja no fundo**: é a que sai por último, e carga da primeira parada atrás
   * da carga da terceira obriga a descarregar tudo para entregar a primeira.
   */
  test('carrega a última parada no fundo e a primeira na porta', () => {
    const plan = resolveCargoPlacement({
      bed: BED,
      boxes: [box({ stopSequence: 1 }), box({ stopSequence: 3 })],
    })

    const boxes = plan?.layers[0]?.boxes ?? []
    const first = boxes[0]
    const last = boxes[boxes.length - 1]

    expect(first?.stopSequence).toBe(3)
    expect(last?.stopSequence).toBe(1)
    expect(first?.xM).toBeLessThanOrEqual(last?.xM ?? 0)
  })

  /**
   * ⚠️ Girar no plano é sempre permitido — é o mesmo lado no chão. `keep_upright` proíbe **deitar**
   * (usar a altura como base), que é outra coisa, e confundir os dois faria a planta recusar caixa
   * que cabe perfeitamente virada.
   */
  test('gira a caixa no plano para caber, sem deitá-la', () => {
    const wide = box({ lengthMm: 2400, widthMm: 500 })
    const plan = resolveCargoPlacement({ bed: BED, boxes: [wide] })

    expect(plan?.unplaced).toHaveLength(0)
    expect(plan?.layers[0]?.boxes[0]?.heightM).toBe(0.4)
  })

  /** Frágil não recebe peso: ela sobe para a última camada, ou não entra. */
  test('põe a frágil por cima de tudo', () => {
    const plan = resolveCargoPlacement({
      bed: BED,
      boxes: [box({ count: 40 }), box({ count: 1, isFragile: true, label: 'OVOS' })],
    })

    const placed = plan?.layers.flatMap((layer) => layer.boxes) ?? []
    const fragile = placed.find((entry) => entry.label === 'OVOS')
    const topLayer = (plan?.layers.length ?? 1) - 1

    expect(fragile?.layer).toBe(topLayer)
    expect(fragile?.reasons).toContain('fragileOnTop')
  })

  /**
   * ⚠️ `is_stackable` **nulo** empilha e marca presumido; `false` não empilha e **não** marca. É a
   * diferença entre uma carga que ninguém olhou e uma cuja restrição alguém conferiu.
   */
  test('distingue o que ninguém informou do que foi informado como não empilhável', () => {
    /** 72 caixas cabem no piso deste baú; 200 só entram empilhando. */
    const unknown = resolveCargoPlacement({ bed: BED, boxes: [box({ count: 200 })] })
    const declared = resolveCargoPlacement({
      bed: BED,
      /** Declarado é declarado **inteiro**: um campo nulo ao lado já é informação faltando. */
      boxes: [box({ count: 200, isFragile: false, isStackable: false })],
    })

    expect(unknown?.source).toBe('estimated')
    expect((unknown?.layers.length ?? 0) > 1).toBe(true)
    expect(declared?.source).toBe('measured')
    /** Declarada não empilhável, ela fica no piso — e o que sobra é dito, não empilhado à força. */
    expect(declared?.layers).toHaveLength(1)
    expect(declared?.unplaced[0]?.reason).toBe('bedFull')
    expect(declared?.layers[0]?.boxes[0]?.reasons).toContain('notStackable')
  })

  /** O que não cabe é **nomeado**, nunca encolhido para caber. */
  test('devolve a caixa que não cabe em vez de comprimi-la', () => {
    const huge = box({ lengthMm: 9000, widthMm: 3000 })
    const plan = resolveCargoPlacement({ bed: BED, boxes: [huge] })

    expect(plan?.unplaced).toHaveLength(1)
    expect(plan?.unplaced[0]?.reason).toBe('largerThanBed')
  })

  /** Carga acima do teto do baú para nas camadas que cabem, e o resto é dito. */
  test('para no teto do baú e nomeia o excedente', () => {
    const plan = resolveCargoPlacement({ bed: BED, boxes: [box({ count: 400 })] })

    expect((plan?.layers.length ?? 0) > 0).toBe(true)
    expect(plan?.unplaced[0]?.reason).toBe('bedFull')
  })

  /** Sem as três medidas do baú não há planta — a regra da 088 D2 vale aqui inteira. */
  test('não desenha planta sem o baú medido', () => {
    expect(resolveCargoPlacement({ bed: null, boxes: [box({})] })).toBeNull()
  })

  /** Caixa sem medida não entra na planta: posição de palpite é o que a 085 recusou. */
  test('ignora a caixa que ninguém mediu', () => {
    const plan = resolveCargoPlacement({
      bed: BED,
      boxes: [box({ heightMm: null, lengthMm: null, widthMm: null })],
    })

    expect(plan?.layers.flatMap((layer) => layer.boxes)).toHaveLength(0)
    expect(plan?.unplaced[0]?.reason).toBe('notMeasured')
  })
})
