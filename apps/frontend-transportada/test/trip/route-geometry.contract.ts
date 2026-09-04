/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  resolveRouteTrace,
  type RouteGeometry,
} from '../../src/modules/trip/shared/routeGeometry.service'

const PARADAS = [
  { x: 10, y: 90 },
  { x: 90, y: 10 },
]

/** Projeção de mentira, mas fiel ao contrato: a mesma que levou os pinos ao `viewBox`. */
const project = (point: { readonly latitude: number; readonly longitude: number }) => ({
  x: (point.longitude + 47.8908) * 10000 + 10,
  y: 90 - (point.latitude + 22.0175) * 10000,
})

const ESTRADA: RouteGeometry = {
  legs: [
    { distanceMetres: 620.5, durationSeconds: 93 },
    { distanceMetres: 619.9, durationSeconds: 93 },
  ],
  points: [
    { latitude: '-22.01750', longitude: '-47.89080' },
    { latitude: '-22.01400', longitude: '-47.88500' },
    { latitude: '-22.00900', longitude: '-47.88250' },
  ],
  source: 'road',
}

describe('traço do roteiro (spec 079, geometria do OSRM)', () => {
  /**
   * ⚠️ A regra que ordena todas: **o desenho diz qual dos dois é**. Uma reta entre duas paradas
   * atravessa rio, serra e ferrovia sem pedir licença; desenhá-la com o mesmo traço da estrada faz
   * o operador ler caminho onde não há. Quando a estrada chega, ela é sólida; quando não chega, o
   * traço é tracejado e a legenda diz que é linha reta.
   */
  test('distingue a estrada da reta no próprio traço', () => {
    const comEstrada = resolveRouteTrace({ geometry: ESTRADA, project, stops: PARADAS })
    const semEstrada = resolveRouteTrace({ geometry: null, project, stops: PARADAS })

    expect(comEstrada.kind).toBe('road')
    expect(semEstrada.kind).toBe('straight')
    expect(comEstrada.dashed).toBe(false)
    expect(semEstrada.dashed).toBe(true)
  })

  /** Provedor mudo e provedor ausente são a mesma coisa para quem olha: reta, e dita como reta. */
  test('trata indisponível como ausente, nunca como estrada vazia', () => {
    const trace = resolveRouteTrace({
      geometry: { legs: [], points: [], source: 'unavailable' },
      project,
      stops: PARADAS,
    })

    expect(trace.kind).toBe('straight')
    expect(trace.path).not.toBe('')
  })

  /**
   * A geometria vem em graus e o mapa desenha em `viewBox`. Projetá-la com a caixa **das paradas**
   * é o que mantém pino e linha no mesmo lugar — reprojetar pela caixa da estrada deslocaria um do
   * outro justamente onde a estrada faz a volta mais larga.
   */
  test('projeta a estrada na mesma caixa dos pinos', () => {
    const trace = resolveRouteTrace({ geometry: ESTRADA, project, stops: PARADAS })
    const coordenadas = [...trace.path.matchAll(/-?\d+(?:\.\d+)?/gu)].map((match) =>
      Number(match[0]),
    )

    // A primeira coordenada da estrada coincide com o primeiro pino: mesma caixa, mesma origem.
    expect(coordenadas.at(0)).toBeCloseTo(PARADAS[0]!.x, 3)
    expect(coordenadas.at(1)).toBeCloseTo(PARADAS[0]!.y, 3)
  })

  test('uma parada só não vira traço nenhum', () => {
    expect(resolveRouteTrace({ geometry: null, project, stops: [PARADAS[0]!] }).path).toBe('')
  })

  /**
   * A consulta é **separada** do detalhe da viagem, e é por isso que a tela abre sem esperar o
   * OSRM: medido, a chamada custa 63 ms. Um campo no detalhe atrasaria a página inteira.
   */
  test('a geometria tem consulta própria, fora do detalhe da viagem', () => {
    const cliente = readFileSync(
      new URL('../../src/modules/trip/shared/tripClient.service.ts', import.meta.url),
      'utf8',
    )

    expect(cliente).toInclude('route-geometry')
  })
})
