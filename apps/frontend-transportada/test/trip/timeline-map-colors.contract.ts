/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  PIN_INK_DARK,
  PIN_INK_LIGHT,
  TIMELINE_EVENT_CATEGORY_COLOR,
  hexToLab,
  labDistance,
  resolvePinInk,
  resolveStopColor,
} from '@/modules/trip/shared/stopColor.service'
import { TIMELINE_MAP_CATEGORIES } from '@/modules/trip/shared/tripTimelineMap.constant'

const SAME_COLOUR_DISTANCE = 6.2
const MINIMUM_CONTRAST = 2.4
const BACKGROUNDS = ['#10222c', '#fbf9f5', '#f0f2ee'] as const

function readMapSurface(): readonly string[] {
  const source = readFileSync(
    new URL('../../src/modules/trip/shared/stopColor.service.ts', import.meta.url),
    'utf8',
  )
  const block = source.match(/const MAP_SURFACE = \[([\s\S]*?)\] as const/)?.[1] ?? ''
  return block.match(/#[0-9a-f]{6}/gu) ?? []
}

function relativeLuminance(hex: string): number {
  const [red = 0, green = 0, blue = 0] = [1, 3, 5]
    .map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first)
  const b = relativeLuminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const entries = TIMELINE_MAP_CATEGORIES.map((category) => [
  category,
  TIMELINE_EVENT_CATEGORY_COLOR[category],
]) as readonly (readonly [string, string])[]

describe('as cores do minimapa por tipo de evento (spec 196)', () => {
  it('há uma cor hexadecimal por categoria, e só uma', () => {
    expect(Object.keys(TIMELINE_EVENT_CATEGORY_COLOR).sort()).toEqual(
      [...TIMELINE_MAP_CATEGORIES].sort(),
    )
    for (const [, color] of entries) expect(color).toMatch(/^#[0-9a-f]{6}$/u)
  })

  it('cada cor tem contraste suficiente nos dois temas e na superfície clara', () => {
    for (const [category, color] of entries) {
      for (const background of BACKGROUNDS) {
        expect([category, contrastRatio(color, background) >= MINIMUM_CONTRAST]).toEqual([
          category,
          true,
        ])
      }
    }
  })

  it('cada cor fica na janela de luminância das paradas', () => {
    for (const [, color] of entries) {
      const luminance = relativeLuminance(color)
      expect(luminance).toBeGreaterThanOrEqual(0.04)
      expect(luminance).toBeLessThanOrEqual(0.33)
    }
  })

  it('duas categorias nunca partilham cor distinguível a olho', () => {
    for (const [firstCategory, first] of entries) {
      for (const [secondCategory, second] of entries) {
        if (firstCategory >= secondCategory) continue
        expect([
          firstCategory,
          secondCategory,
          labDistance(hexToLab(first), hexToLab(second)) > SAME_COLOUR_DISTANCE,
        ]).toEqual([firstCategory, secondCategory, true])
      }
    }
  })

  it('nenhuma cor cai sobre o que o mapa base já desenha', () => {
    const surface = readMapSurface()
    expect(surface.length).toBeGreaterThan(0)
    for (const [category, color] of entries) {
      for (const drawn of surface) {
        expect([
          category,
          labDistance(hexToLab(color), hexToLab(drawn)) > SAME_COLOUR_DISTANCE,
        ]).toEqual([category, true])
      }
    }
  })

  /**
   * ⚠️ A tinta do pino **segue o preenchimento, nunca o tema**. O preenchimento é literal — o
   * MapLibre pinta em WebGL e não resolve `var()` — e por isso não muda com o tema; pintar o que
   * senta em cima com um token que muda era o defeito: no escuro o glifo caía para 2,65.
   */
  it('a tinta do pino não sai de um token que troca de tema', () => {
    const css = readFileSync(
      new URL('../../src/modules/trip/styles/trip.module.css', import.meta.url),
      'utf8',
    )
    const start = css.indexOf('.tilePin {')
    expect(start).toBeGreaterThan(-1)
    /** Sem comentários: senão o token citado na explicação passa por declaração em vigor. */
    const rule = css.slice(start, css.indexOf('}', start)).replace(/\/\*[\s\S]*?\*\//gu, '')
    expect(rule).not.toContain('--color-ink-on-accent')
  })

  /**
   * ⚠️ **Pino que esquece a tinta não quebra: ele herda.** Com a declaração fora do CSS, um terceiro
   * construtor que pintasse só o fundo sairia com a tinta do corpo da página — foi o que a tela
   * mostrou no recarregamento parcial, medindo 2,41. Por isso o par é cobrado no código-fonte: todo
   * `style.background` do mapa vem seguido do `style.color` que sai da mesma cor.
   */
  it('todo pino que pinta o fundo pinta a tinta na linha seguinte', () => {
    const source = readFileSync(
      new URL('../../src/modules/trip/components/AssemblyVectorMap.component.tsx', import.meta.url),
      'utf8',
    )
    const fills = [...source.matchAll(/^\s*element\.style\.background = (.+)$/gmu)]
    expect(fills.length).toBeGreaterThan(0)
    for (const fill of fills) {
      const after = source.slice((fill.index ?? 0) + fill[0].length).trimStart()
      expect([fill[1], after.startsWith('element.style.color = resolvePinInk(')]).toEqual([
        fill[1],
        true,
      ])
    }
  })

  it('a tinta escolhida é sempre a de maior contraste entre as duas', () => {
    for (const [category, color] of entries) {
      const chosen = resolvePinInk(color)
      const rejected = chosen === PIN_INK_LIGHT ? PIN_INK_DARK : PIN_INK_LIGHT
      expect([category, chosen === PIN_INK_LIGHT || chosen === PIN_INK_DARK]).toEqual([
        category,
        true,
      ])
      expect([category, contrastRatio(color, chosen) >= contrastRatio(color, rejected)]).toEqual([
        category,
        true,
      ])
    }
  })

  /** O mínimo de objeto gráfico (WCAG 1.4.11). O glifo do minimapa é desenho, não texto. */
  it('todo tipo de evento passa do piso de objeto gráfico, nos dois temas', () => {
    for (const [category, color] of entries) {
      const measured = contrastRatio(color, resolvePinInk(color))
      expect([category, measured >= 3]).toEqual([category, true])
    }
  })

  /**
   * ⚠️ **O mapa do roteiro usa o mesmo `.tilePin`, e não pode piorar.** Uma tinta fixa consertaria o
   * minimapa e derrubaria o irmão: a paleta gerada vai até luminância 0,30, onde a tinta clara mede
   * 2,83 — pior que os 5,43 que a tinta escura dá hoje no tema escuro. Por isso a tinta é por cor, e
   * este caso confere parada a parada que nenhuma delas perdeu contraste em nenhum dos dois temas.
   */
  it('nenhuma parada do mapa do roteiro perde contraste em qualquer tema', () => {
    for (let sequence = 1; sequence <= 96; sequence += 1) {
      const color = resolveStopColor(sequence)
      const after = contrastRatio(color, resolvePinInk(color))
      for (const ink of [PIN_INK_DARK, PIN_INK_LIGHT]) {
        expect([sequence, after >= contrastRatio(color, ink)]).toEqual([sequence, true])
      }
      expect([sequence, after >= 3]).toEqual([sequence, true])
    }
  })

  it('o CSS do selo da legenda usa exatamente os hexadecimais do TS', () => {
    const css = readFileSync(
      new URL('../../src/modules/trip/styles/tripTimelineMiniMap.module.css', import.meta.url),
      'utf8',
    )
    for (const [category, color] of entries) {
      const rule = css.match(new RegExp(`\\.${category} \\{\\s*background: (#[0-9a-f]{6});`, 'u'))
      expect([category, rule?.[1]]).toEqual([category, color])
    }
  })
})
