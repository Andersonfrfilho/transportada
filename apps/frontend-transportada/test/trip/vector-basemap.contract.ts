/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import { describe, expect, it } from 'bun:test'

import {
  BASEMAP_THEMES,
  buildBasemapStyle,
  resolveBasemapOutline,
} from '@/modules/trip/shared/vectorBasemap.service'

/** A validação é da **forma** do estilo; a paleta real é resolvida no documento, que aqui não há. */
const resolveToken = (token: string): string => `#${token.length.toString(16).padStart(6, '0')}`

function cityLayer(theme: (typeof BASEMAP_THEMES)[number]) {
  const layer = buildBasemapStyle(resolveToken, theme).layers.find((entry) => entry.id === 'cidade')
  if (layer === undefined || layer.type !== 'symbol') throw new Error('camada cidade ausente')
  return layer
}

/**
 * Toda sub-expressão `['interpolate', …, ['get','rank'], …]` dentro do valor, em qualquer
 * profundidade — a rampa de rank vive aninhada como saída da rampa de zoom.
 */
function rankRamps(value: unknown): readonly unknown[][] {
  if (!Array.isArray(value)) return []
  const found = value.flatMap((entry) => rankRamps(entry))
  const isRankRamp =
    value[0] === 'interpolate' &&
    Array.isArray(value[2]) &&
    value[2][0] === 'get' &&
    value[2][1] === 'rank'
  return isRankRamp ? [value, ...found] : found
}

/** Os degraus vêm em pares entrada/saída a partir do índice 3; a última entrada é o teto da rampa. */
function lastStop(ramp: readonly unknown[]): number {
  return Number(ramp[ramp.length - 2])
}

describe('o estilo do mapa vetorial', () => {
  /**
   * ⚠️ O contrato que paga por si: expressão malformada faz o MapLibre emitir `error`, e o tratador
   * de erro do componente **derruba o mapa inteiro** — a tela cai para a lista sem nada explicando.
   * Já aconteceu com um `glyphs` apontando para lugar nenhum. Aqui isso vira teste, não incidente.
   */
  it.each([...BASEMAP_THEMES])('é válido contra o spec do MapLibre — tema %s', (theme) => {
    expect(validateStyleMin(buildBasemapStyle(resolveToken, theme))).toEqual([])
  })

  /**
   * ⚠️ Sem `symbol-sort-key` o MapLibre resolve colisão pela **posição na tela**. Medido nas telhas
   * de Ribeirão: 155 feições `city|town|village` numa telha do z9 — com essa densidade, quem
   * sobrevive vira sorteio, e um povoado de rank 14 apaga a capital por estar mais acima no quadro.
   * Chave menor é colocada primeiro, e `rank` menor é lugar mais importante.
   */
  it('resolve colisão de rótulo por importância, não por posição na tela', () => {
    expect(cityLayer('claro').layout?.['symbol-sort-key']).toEqual(['get', 'rank'])
  })

  /**
   * ⚠️ Medido em produção nas telhas do sudeste: o `rank` da camada `place` vai até **18**, e no z9
   * são 148 de 155 feições com rank ≥ 11. A rampa antiga ia de 1 a 10, então o `interpolate`
   * grampeava 95% dos rótulos no piso e o corpo era constante na prática. Este teste falha se
   * alguém voltar a fechar a rampa antes do rank que o planetiler realmente emite.
   */
  it('dimensiona o rótulo pela faixa de rank que as telhas trazem de verdade', () => {
    const rampas = rankRamps(cityLayer('claro').layout?.['text-size'])

    expect(rampas.length).toBeGreaterThan(0)
    /** Toda rampa de rank tem de alcançar o rank máximo medido, não só a primeira. */
    for (const rampa of rampas) expect(lastStop(rampa)).toBeGreaterThanOrEqual(18)
  })

  /** Rótulo que não cabe onde queria tenta outro lado antes de ser descartado — é o que adensa. */
  it('deixa o rótulo procurar lugar antes de desistir', () => {
    expect(cityLayer('claro').layout?.['text-variable-anchor']).toBeDefined()
  })

  /**
   * ⚠️ O anel do pino era `--color-plate-surface` fixo — quase branco — e sumia nos dois temas de
   * papel claro. Ele acompanha o tema desde então, e este teste falha se voltar a ser constante.
   */
  it('dá ao pino um anel diferente por tema de mapa', () => {
    const anéis = BASEMAP_THEMES.map((theme) => resolveBasemapOutline(resolveToken, theme))
    expect(new Set(anéis).size).toBeGreaterThan(1)
  })
})

/**
 * ⚠️ **O defeito mais caro desta spec, e o mais silencioso.** O MapLibre acrescenta a classe
 * `maplibregl-map` ao nosso elemento e declara `.maplibregl-map { position: relative; overflow:
 * hidden }` — mesma especificidade que a nossa regra, e injetada depois. Sem `width`/`height`
 * explícitos, `position: relative` vence, o `inset: 0` fica inerte, a caixa colapsa para altura 0 e
 * o `overflow: hidden` dele recorta o canvas a nada.
 *
 * O mapa **carrega, pinta e não aparece**: `isStyleLoaded`, `isSourceLoaded` e `loaded()` todos
 * verdadeiros, WebGL vivo, 17 camadas, canvas com 629×300 — e a tela vazia. O único número que
 * denuncia é a altura do elemento raiz. Este teste é o que impede a regressão de voltar a custar
 * um dia de investigação.
 */
describe('a caixa do mapa vetorial', () => {
  const css = readFileSync(
    new URL('../../src/modules/trip/styles/trip.module.css', import.meta.url),
    'utf8',
  )
  const regra = css
    .slice(css.indexOf('.vectorMapCanvas {'))
    .slice(0, css.slice(css.indexOf('.vectorMapCanvas {')).indexOf('}'))

  it('declara largura e altura explícitas, e não confia só no inset', () => {
    expect(regra).toContain('width: 100%')
    expect(regra).toContain('height: 100%')
  })
})
