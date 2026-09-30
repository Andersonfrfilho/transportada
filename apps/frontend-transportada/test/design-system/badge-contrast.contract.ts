/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { compositeOver, contrastRatio, readApplicationFile, readThemes } from './contrast.helper.js'

/** WCAG 2.2 §1.4.3 (AA). O selo tem 0,6875rem (11px) em peso normal — texto pequeno, piso de 4,5. */
const MINIMUM_TEXT_CONTRAST = 4.5

/** As duas superfícies sobre as quais um selo pousa: a página e o diálogo. */
const SURFACE_TOKENS = ['--color-asphalt', '--color-graphite'] as const

const BADGE_RULE = /\.ui-badge-([a-z]+)\s*\{([^}]*)\}/g
const COLOR_DECLARATION = /(?:^|\n)\s*color:\s*var\((--[\w-]+)\)/
const SOLID_BACKGROUND = /background:\s*var\((--[\w-]+)\)/
const TINT_BACKGROUND =
  /background:\s*color-mix\(in srgb,\s*var\((--[\w-]+)\)\s*(\d+)%,\s*transparent\)/

type BadgeVariant = Readonly<{
  backgroundPercent: number
  backgroundToken: string
  name: string
  textToken: string
}>

export function parseBadgeVariants(source: string): readonly BadgeVariant[] {
  return [...source.matchAll(BADGE_RULE)].flatMap(([, name = '', body = '']) => {
    const textToken = COLOR_DECLARATION.exec(body)?.[1]
    const tint = TINT_BACKGROUND.exec(body)
    const solid = SOLID_BACKGROUND.exec(body)
    if (textToken === undefined) return []
    if (tint?.[1] !== undefined) {
      return [
        {
          backgroundPercent: Number(tint[2]) / 100,
          backgroundToken: tint[1],
          name,
          textToken,
        },
      ]
    }
    if (solid?.[1] === undefined) return []

    return [{ backgroundPercent: 1, backgroundToken: solid[1], name, textToken }]
  })
}

describe('o selo é legível nos dois temas (spec 220 T4.6)', () => {
  test('encontra as cinco variantes do selo, com a receita de fundo de cada uma', async () => {
    const variants = parseBadgeVariants(await readApplicationFile('src/styles/index.css'))

    expect(variants.map((variant) => variant.name).sort()).toEqual([
      'default',
      'info',
      'secondary',
      'success',
      'warning',
    ])
    expect(variants.find((variant) => variant.name === 'default')?.backgroundPercent).toBe(1)
    expect(variants.find((variant) => variant.name === 'success')?.backgroundPercent).toBe(0.14)
  })

  /**
   * ⚠️ **A variante semântica reprovava no tema claro, e só nele.** Medido em 2026-09-30, com o
   * fundo translúcido composto sobre a página: `success` 3,69:1 e `warning` 3,93:1 no claro, contra
   * o piso de 4,5:1 — enquanto o mesmo par passava folgado no escuro. A cor do texto era o próprio
   * acento que pinta o fundo, e um acento que serve de preenchimento não serve de tinta sobre a sua
   * própria tinta: no tema claro não sobra distância. É o mesmo defeito de forma que o cinza
   * discreto teve, e a correção é a mesma — tinta declarada por tema, não receita no call site.
   */
  test('cada variante alcança AA sobre as duas superfícies de cada tema', async () => {
    const variants = parseBadgeVariants(await readApplicationFile('src/styles/index.css'))
    const themes = await readThemes()
    const failures: string[] = []

    for (const [themeName, tokens] of themes) {
      for (const variant of variants) {
        for (const surfaceToken of SURFACE_TOKENS) {
          const background = compositeOver({
            color: tokens.get(variant.backgroundToken) ?? '',
            percent: variant.backgroundPercent,
            surface: tokens.get(surfaceToken) ?? '',
          })
          const ratio = contrastRatio(tokens.get(variant.textToken) ?? '', background)
          if (ratio < MINIMUM_TEXT_CONTRAST) {
            failures.push(`${themeName} ${variant.name} sobre ${surfaceToken}: ${ratio.toFixed(2)}`)
          }
        }
      }
    }

    expect(failures).toEqual([])
  })

  test('acusa a variante plantada que pinta o texto com o acento do próprio fundo', () => {
    const planted = parseBadgeVariants(
      '.ui-badge-success {\n  color: var(--color-ready);\n  background: color-mix(in srgb, var(--color-ready) 14%, transparent);\n}',
    )

    expect(planted).toEqual([
      {
        backgroundPercent: 0.14,
        backgroundToken: '--color-ready',
        name: 'success',
        textToken: '--color-ready',
      },
    ])
    expect(
      contrastRatio(
        '#2e7d54',
        compositeOver({ color: '#2e7d54', percent: 0.14, surface: '#f2efe9' }),
      ),
    ).toBeLessThan(MINIMUM_TEXT_CONTRAST)
  })
})
