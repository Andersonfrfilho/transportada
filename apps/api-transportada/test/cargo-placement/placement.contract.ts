/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  PLACEMENT_REASONS,
  resolveCargoPlacement,
  resolveFallbackBox,
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
  /**
   * ⚠️ **Encostada na porta, não na testeira.** A fatia é do tamanho da carga: uma caixa sozinha não
   * é esticada pelos 7,4 m do baú, e o vão sobra atrás dela — que é onde vão sobrar não atrapalha
   * ninguém na descarga.
   */
  test('posiciona a caixa no piso, encostada na porta', () => {
    const plan = resolveCargoPlacement({ bed: BED, boxes: [box({})] })

    expect(plan?.layers).toHaveLength(1)
    expect(plan?.layers[0]?.boxes[0]).toMatchObject({ depthM: 0.6, layer: 0, widthM: 0.4, xM: 6.8 })
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

/**
 * A caixa presumida: sem medida, o desenho ainda posiciona — derivando uma caixa do volume
 * estimado, na proporção da que a empresa já mediu.
 */
describe('caixa presumida (spec 094 P2)', () => {
  /** As cinco caixas medidas desta base: 0,0163 a 0,0300 m³, mediana 0,0210. */
  const MEASURED = [
    { heightMm: 250, lengthMm: 400, widthMm: 300 },
    { heightMm: 210, lengthMm: 385, widthMm: 260 },
    { heightMm: 220, lengthMm: 380, widthMm: 280 },
    { heightMm: 210, lengthMm: 360, widthMm: 260 },
    { heightMm: 200, lengthMm: 340, widthMm: 240 },
  ]

  test('deriva a caixa do volume, na proporção da mediana medida', () => {
    const fallback = resolveFallbackBox({ measured: MEASURED, volumeM3: 0.021 })

    expect(fallback).not.toBeNull()
    const volume =
      ((fallback?.heightMm ?? 0) * (fallback?.lengthMm ?? 0) * (fallback?.widthMm ?? 0)) / 1e9
    expect(volume).toBeCloseTo(0.021, 3)
  })

  /**
   * ⚠️ **Proporção, não cubo.** Um cubo de 0,021 m³ tem 27,6 cm de lado e empilha diferente de uma
   * caixa de 38 × 26 × 21 — e a planta é justamente sobre como as peças se arrumam no piso.
   */
  test('mantém a forma da caixa da empresa, não um cubo', () => {
    const fallback = resolveFallbackBox({ measured: MEASURED, volumeM3: 0.021 })
    const ratio = (fallback?.lengthMm ?? 0) / (fallback?.widthMm ?? 1)

    expect(ratio).toBeGreaterThan(1.2)
  })

  /** Sem nenhuma caixa medida na empresa, a proporção vem do catálogo — e o desenho continua. */
  test('cai na proporção de catálogo quando a empresa não mediu nada', () => {
    const fallback = resolveFallbackBox({ measured: [], volumeM3: 0.021 })

    expect(fallback).not.toBeNull()
    expect(fallback?.lengthMm).toBeGreaterThan(fallback?.widthMm ?? 0)
  })

  /** Volume ausente ou zero não vira caixa: seria inventar tamanho, não estimá-lo. */
  test('não inventa caixa sem volume', () => {
    expect(resolveFallbackBox({ measured: MEASURED, volumeM3: 0 })).toBeNull()
    expect(resolveFallbackBox({ measured: MEASURED, volumeM3: null })).toBeNull()
  })
})

/**
 * ⚠️ É o motivo que separa um desenho de uma instrução. Sem ele o operador vê uma arrumação e não
 * tem como discordar dela — e discordar é o que ele faz melhor que o algoritmo, porque viu a carga.
 */
describe('o motivo de cada posição (spec 094 P4)', () => {
  test('o vocabulário é fechado, e cobre as seis decisões que a planta toma', () => {
    expect(PLACEMENT_REASONS).toEqual([
      'lastStopFirst',
      'fragileOnTop',
      'notStackable',
      'keepUpright',
      'estimatedBox',
      'axleNotChecked',
      'splitCargo',
      'weightBalanced',
    ])
  })

  test('toda caixa posicionada carrega ao menos a ordem de entrega', () => {
    const plan = resolveCargoPlacement({ bed: BED, boxes: [box({})] })

    expect(plan?.layers[0]?.boxes[0]?.reasons).toEqual(['lastStopFirst'])
  })

  test('a caixa presumida diz que é presumida', () => {
    const plan = resolveCargoPlacement({
      bed: BED,
      boxes: [box({ keepUpright: true, source: 'estimated' })],
    })

    expect(plan?.layers[0]?.boxes[0]?.reasons).toContain('estimatedBox')
    expect(plan?.layers[0]?.boxes[0]?.reasons).toContain('keepUpright')
  })

  /** Motivo que a política não conhece não vira texto livre — ele não existe. */
  test('não há motivo fora da lista', () => {
    const plan = resolveCargoPlacement({
      bed: BED,
      boxes: [box({ count: 12, isFragile: true, isStackable: false, keepUpright: true })],
    })
    const reasons = plan?.layers.flatMap((layer) => layer.boxes.flatMap((entry) => entry.reasons))

    for (const reason of reasons ?? []) {
      expect(PLACEMENT_REASONS).toContain(reason)
    }
  })
})

/**
 * ⚠️ O teto de tempo é critério de aceite, não zelo: a planta é calculada **dentro** da prévia de
 * carga, que roda a cada clique na montagem. Uma viagem grande travando a tela é o tipo de coisa
 * que só aparece em produção quando não é medida antes.
 */
describe('desempenho do empacotador (spec 094 RF-NF)', () => {
  test('uma viagem de 300 notas cabe em 50 ms', () => {
    /** Três caixas por nota, o que esta base tem de mediana — 900 caixas ao todo. */
    const boxes = Array.from({ length: 900 }, (_, index) =>
      box({ count: 4, stopSequence: (index % 12) + 1 }),
    )

    const startedAt = performance.now()
    const plan = resolveCargoPlacement({ bed: BED, boxes })
    const elapsed = performance.now() - startedAt

    expect(plan).not.toBeNull()
    expect(elapsed).toBeLessThan(50)
  })

  /**
   * ⚠️ O teto de caixas desenhadas existe porque o desenho não fica melhor com duas mil — fica
   * lento e ilegível. O excedente é **dito**, como tudo que não entra.
   */
  test('para de desenhar no teto e nomeia o excedente', () => {
    /**
     * Caixa pequena de propósito: com a de 60 × 40 × 40 o **baú** enche em 360 e o teto de desenho
     * nunca é alcançado — o teste passaria sem exercitar nada.
     */
    const boxes = Array.from({ length: 400 }, () =>
      box({ count: 4, heightMm: 200, lengthMm: 200, widthMm: 200 }),
    )
    const plan = resolveCargoPlacement({ bed: BED, boxes })
    const placed = plan?.layers.reduce((total, layer) => total + layer.boxes.length, 0) ?? 0

    expect(placed).toBeLessThanOrEqual(600)
    expect(plan?.unplaced.some((entry) => entry.reason === 'tooMany')).toBe(true)
  })
})
