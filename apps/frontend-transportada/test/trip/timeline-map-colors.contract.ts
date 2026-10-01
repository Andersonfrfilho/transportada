/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  TIMELINE_EVENT_CATEGORY_COLOR,
  hexToLab,
  labDistance,
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
