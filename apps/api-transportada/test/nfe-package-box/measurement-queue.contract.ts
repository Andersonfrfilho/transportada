/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildMeasurementQueue,
  countBoxFamilies,
  countPackagingSiblings,
} from '../../src/nfe-documents/domain/package-box-queue.policy.js'

const ITEMS = [
  { id: 'c', measured: false, transportedVolumes: 10 },
  { id: 'a', measured: false, transportedVolumes: 60 },
  { id: 'b', measured: false, transportedVolumes: 30 },
]

describe('a fila de medição de caixas (spec 085 G005)', () => {
  /** Medir na ordem do cadastro é medir 663 caixas; na ordem do que roda, 12 cobrem 25%. */
  test('ordena pelo que mais transporta', () => {
    expect(buildMeasurementQueue({ items: ITEMS }).entries.map((entry) => entry.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  test('acumula a fatia até o total', () => {
    const [first, second, third] = buildMeasurementQueue({ items: ITEMS }).entries

    expect(first?.cumulativeShare).toBeCloseTo(0.6, 6)
    expect(second?.cumulativeShare).toBeCloseTo(0.9, 6)
    expect(third?.cumulativeShare).toBeCloseTo(1, 6)
  })

  /**
   * ⚠️ O aviso é onde a cauda **deixa de compensar**: a linha que fecha a cobertura é a última que
   * vale medir, e as de baixo dela custam o mesmo tempo do conferente por uma fatia que não move a
   * ocupação. Sem ele a fila é uma lista de 663 itens que ninguém sabe onde parar de descer.
   */
  test('marca até onde a medição compensa', () => {
    const queue = buildMeasurementQueue({ coverageTarget: 0.8, items: ITEMS })

    expect(queue.entries.map((entry) => entry.withinCoverage)).toEqual([true, true, false])
    expect(queue.coveredCount).toBe(2)
  })

  /** A linha que sozinha ultrapassa a meta ainda entra: senão a cobertura sairia vazia. */
  test('a primeira linha sempre compensa', () => {
    const queue = buildMeasurementQueue({
      coverageTarget: 0.5,
      items: [{ id: 'unico', measured: false, transportedVolumes: 900 }],
    })

    expect(queue.entries[0]?.withinCoverage).toBe(true)
  })

  /** Empate resolvido pelo id: sem isso a fila muda de ordem entre duas leituras da mesma tela. */
  test('empate tem ordem estável', () => {
    const queue = buildMeasurementQueue({
      items: [
        { id: 'z', measured: false, transportedVolumes: 5 },
        { id: 'a', measured: false, transportedVolumes: 5 },
      ],
    })

    expect(queue.entries.map((entry) => entry.id)).toEqual(['a', 'z'])
  })

  /**
   * ⚠️ Fila vazia e fila que só tem caixa nunca transportada dão o mesmo denominador — zero. Dividir
   * por ele produziria `NaN` em toda a coluna de porcentagem.
   */
  test('nada transportado não vira divisão por zero', () => {
    const queue = buildMeasurementQueue({
      items: [{ id: 'a', measured: false, transportedVolumes: 0 }],
    })

    expect(queue.totalVolumes).toBe(0)
    expect(queue.entries[0]?.cumulativeShare).toBe(0)
    expect(queue.entries[0]?.withinCoverage).toBe(false)
    expect(buildMeasurementQueue({ items: [] }).entries).toEqual([])
  })
})

/**
 * ⚠️ **A prioridade é do filtro, não da ordem** (spec 085 G005). Ordenar "pendentes primeiro" foi
 * tentado e desfeito: com 663 caixas por medir e cinco medidas, toda medida caía para além das
 * cinquenta da página e a opção "Todas" ficava idêntica a "Faltam medir". A ordem é sempre o volume
 * transportado — a mesma que dá sentido à fatia e ao acumulado.
 */
describe('a ordem não conhece a situação da medida', () => {
  test('a caixa medida de maior volume continua na frente', () => {
    const queue = buildMeasurementQueue({
      items: [
        { id: 'medida-grande', measured: true, transportedVolumes: 900 },
        { id: 'pendente-media', measured: false, transportedVolumes: 100 },
      ],
    })

    expect(queue.entries.map((entry) => entry.id)).toEqual(['medida-grande', 'pendente-media'])
    expect(queue.entries[0]?.share).toBeCloseTo(0.9, 3)
  })
})

/**
 * D9: o contador de família sai de uma window function sobre TODAS as caixas da empresa, antes do
 * `LIMIT` — senão ele mente para toda família que atravessa a borda da página de 50.
 */
const EMITTER_TAX_ID = '05868574001090'

describe('o contador de família não conhece a janela da página (spec 155 D9)', () => {
  /** D1: a família é `(emitente, prefixo, uCom)` — o mesmo texto de outro emitente é outra caixa. */
  test('mesmo prefixo e unidade de emitentes diferentes não se contam', () => {
    const counts = countBoxFamilies([
      {
        commercialUnit: 'CX180',
        description: 'REFR TANG 18G MANGA',
        emitterTaxId: EMITTER_TAX_ID,
        id: 'deste-emitente',
        measured: false,
      },
      {
        commercialUnit: 'CX180',
        description: 'REFR TANG 18G UVA',
        emitterTaxId: '11222333000181',
        id: 'de-outro-emitente',
        measured: true,
      },
    ])

    expect(counts.get('deste-emitente')?.familyMeasuredCount).toBe(0)
    expect(counts.get('deste-emitente')?.familyPendingCount).toBe(1)
  })

  test('família que atravessa a borda dos 50 primeiros mostra o contador certo', () => {
    /** 49 caixas de enchimento + 2 da família `REFR TANG 18G|CX180` — a 50ª cai fora de um `LIMIT 50`. */
    const filler = Array.from({ length: 49 }, (_unused, index) => ({
      commercialUnit: 'CX10',
      description: `PRODUTO SOLTO ${index}`,
      emitterTaxId: EMITTER_TAX_ID,
      id: `filler-${index}`,
      measured: false,
    }))
    const boxes = [
      ...filler,
      {
        commercialUnit: 'CX180',
        description: 'REFR TANG 18G MANGA',
        emitterTaxId: EMITTER_TAX_ID,
        id: 'dentro-da-pagina',
        measured: false,
      },
      {
        commercialUnit: 'CX180',
        description: 'REFR TANG 18G UVA',
        emitterTaxId: EMITTER_TAX_ID,
        id: 'fora-da-pagina',
        measured: true,
      },
    ]

    const counts = countBoxFamilies(boxes)

    expect(counts.get('dentro-da-pagina')).toEqual({
      familyKey: `${EMITTER_TAX_ID}|REFR TANG 18G|CX180`,
      familyMeasuredCount: 1,
      familyPendingCount: 1,
      variantLabel: 'MANGA',
    })
  })

  test('caixa sem família (prefixo curto ou sem rótulo) não conta nenhuma', () => {
    const counts = countBoxFamilies([
      {
        commercialUnit: 'CX1',
        description: 'AMIDO MILHO MAIZENA 200G',
        emitterTaxId: EMITTER_TAX_ID,
        id: 'sem-rotulo',
        measured: false,
      },
    ])

    expect(counts.get('sem-rotulo')).toEqual({
      familyKey: undefined,
      familyMeasuredCount: 0,
      familyPendingCount: 0,
      variantLabel: '',
    })
  })
})

/** D3: o grupo de embalagem é `(emitente, cProd)` — nunca conta como família nem replica dimensão. */
describe('o contador de embalagem conta irmãs, não a própria caixa (spec 155 D3)', () => {
  test('duas embalagens do mesmo produto contam uma irmã cada', () => {
    const boxes = [
      { commercialUnit: 'CX6', emitterTaxId: '05868574001090', id: 'cx6', productCode: '12311' },
      { commercialUnit: 'UN1', emitterTaxId: '05868574001090', id: 'un1', productCode: '12311' },
    ]

    const counts = countPackagingSiblings(boxes)

    expect(counts.get('cx6')).toEqual({ packagingSiblingCount: 1, packagingUnitCount: 6 })
    expect(counts.get('un1')).toEqual({ packagingSiblingCount: 1, packagingUnitCount: 1 })
  })

  test('produto sem outra embalagem não tem irmã', () => {
    const counts = countPackagingSiblings([
      { commercialUnit: 'CX24', emitterTaxId: '05868574001090', id: 'unica', productCode: '99999' },
    ])

    expect(counts.get('unica')).toEqual({ packagingSiblingCount: 0, packagingUnitCount: 24 })
  })
})
