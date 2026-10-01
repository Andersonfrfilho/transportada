/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

function ruleOf(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`)
  expect([selector, start > -1]).toEqual([selector, true])

  return css.slice(start, css.indexOf('}', start))
}

describe('o mapa da linha do tempo cabe no dedo e fala a língua do painel (spec 196)', () => {
  /**
   * ⚠️ **O mesmo 2,75rem escrito duas vezes deixa de ser a mesma medida na terceira.** O token
   * `--touch-target` já vale exatamente isso; o literal ao lado dele só diz o valor de hoje, e numa
   * revisão do alvo de toque um dos dois fica para trás sem nada falhar.
   */
  it('o alvo de toque da lista de pontos sai do token, e não de um número solto', () => {
    const css = read('../../src/modules/trip/styles/tripTimelineMiniMap.module.css')

    expect(ruleOf(css, '.pointListSummary')).toContain('min-height: var(--touch-target)')
    expect(css).not.toContain('2.75rem')
  })

  /**
   * ⚠️ **Medido na tela antes de mexer: 43,59 × 38,40px.** São os quatro botões sobre o mapa —
   * aproximar, afastar, recentrar e mudar a leitura —, e os dois sentidos ficavam abaixo dos 44px.
   * O `size="sm"` continua mandando no respiro e na fonte; o piso vem do token, por baixo dele.
   */
  it('os controles do mapa cabem no dedo nos dois sentidos', () => {
    const rule = ruleOf(
      read('../../src/modules/trip/styles/trip.module.css'),
      '.vectorMapControls > button',
    )

    expect(rule).toContain('min-width: var(--touch-target)')
    expect(rule).toContain('min-height: var(--touch-target)')
  })

  /**
   * ⚠️ **A tela do mapa se anunciava como "Map".** O nome é do MapLibre, que rotula o canvas pelo
   * seu próprio dicionário; num painel em português o leitor de tela lia a palavra em inglês. O
   * dicionário é parâmetro de construção — `locale` —, e por isso a correção é lá, não num
   * `setAttribute` depois do carregamento, que perderia a troca de estilo.
   */
  it('a tela do mapa se apresenta na língua do painel', () => {
    const source = read('../../src/modules/trip/components/AssemblyVectorMap.component.tsx')
    const start = source.indexOf('new MapLibreMap({')
    expect(start).toBeGreaterThan(-1)

    const construction = source.slice(start, source.indexOf('\n      })', start))
    expect(construction).toContain("'Map.Title': t('assemblyMap.canvasLabel')")

    for (const file of ['trip.locale.json', 'trip.en.locale.json']) {
      const locale = JSON.parse(read(`../../src/modules/trip/locales/${file}`)) as Readonly<{
        assemblyMap: Readonly<{ canvasLabel?: string }>
      }>
      expect([file, (locale.assemblyMap.canvasLabel ?? '').length > 0]).toEqual([file, true])
    }
  })
})
