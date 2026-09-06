/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { buildMeasurementQueue } from '../../src/nfe-documents/domain/package-box-queue.policy.js'

const ITEMS = [
  { id: 'c', transportedVolumes: 10 },
  { id: 'a', transportedVolumes: 60 },
  { id: 'b', transportedVolumes: 30 },
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
      items: [{ id: 'unico', transportedVolumes: 900 }],
    })

    expect(queue.entries[0]?.withinCoverage).toBe(true)
  })

  /** Empate resolvido pelo id: sem isso a fila muda de ordem entre duas leituras da mesma tela. */
  test('empate tem ordem estável', () => {
    const queue = buildMeasurementQueue({
      items: [
        { id: 'z', transportedVolumes: 5 },
        { id: 'a', transportedVolumes: 5 },
      ],
    })

    expect(queue.entries.map((entry) => entry.id)).toEqual(['a', 'z'])
  })

  /**
   * ⚠️ Fila vazia e fila que só tem caixa nunca transportada dão o mesmo denominador — zero. Dividir
   * por ele produziria `NaN` em toda a coluna de porcentagem.
   */
  test('nada transportado não vira divisão por zero', () => {
    const queue = buildMeasurementQueue({ items: [{ id: 'a', transportedVolumes: 0 }] })

    expect(queue.totalVolumes).toBe(0)
    expect(queue.entries[0]?.cumulativeShare).toBe(0)
    expect(queue.entries[0]?.withinCoverage).toBe(false)
    expect(buildMeasurementQueue({ items: [] }).entries).toEqual([])
  })
})
