/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { buildScalePlanViewBox } from '@/components/ui/scale-plan'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/**
 * Spec 088 R2: a planta é o único desenho do produto que promete **medida**. Quem olha confere com
 * a fita, e por isso a razão do `viewBox` é a razão do baú — não a da janela.
 */
describe('design system scale plan contract', () => {
  /** Baú de truck 7,400 × 2,470: `740 + 56` por `247 + 56`, que é a razão da ficha mais a margem. */
  test('keeps the drawing proportional to the bed, not to the viewport', () => {
    expect(buildScalePlanViewBox({ outerLengthM: 7.4, widthM: 2.47 })).toBe('0 0 796 303')
    expect(buildScalePlanViewBox({ outerLengthM: 8.9, widthM: 2.5 })).toBe('0 0 946 306')
  })

  /** Baú mais largo que comprido (utilitário 1,70 × 1,30) continua correto: a razão é a da ficha. */
  test('draws a bed wider than it is long without flipping the axes', () => {
    expect(buildScalePlanViewBox({ outerLengthM: 1.7, widthM: 1.3 })).toBe('0 0 226 186')
  })

  /** O excedente alarga o desenho e **não** o contorno: a carga sai fora da porta (critério 6). */
  test('widens the drawing past the bed when the load runs through the door', () => {
    expect(buildScalePlanViewBox({ outerLengthM: 10, widthM: 2.5 })).toBe('0 0 1056 306')
  })

  /**
   * Mobile-first: o baú de 8,9 m não cabe em 375px, e comprimi-lo destruiria a escala. O desenho
   * rola no **próprio** contêiner, e a página nunca ganha barra horizontal.
   */
  test('scrolls inside its own container instead of compressing the scale', async () => {
    const stylesheet = await readApplicationFile('src/components/ui/scale-plan.module.css')

    expect(stylesheet).toContain('overflow-x: auto')
    expect(stylesheet).toContain('overscroll-behavior-x: contain')
  })

  /**
   * ⚠️ A cor da parada fica **por baixo** da hachura do excedente. Trocar o preenchimento apagava a
   * cor da faixa inteira mesmo quando só uma ponta dela sai do baú — e é a cor que liga a faixa à
   * legenda e ao pino do mapa (R3).
   */
  test('keeps the stop colour under the overflow hatch instead of replacing it', async () => {
    const component = await readApplicationFile('src/components/ui/scale-plan.tsx')

    expect(component).toContain('fill={band.color}')
    expect(component).toContain('fill="url(#scale-plan-hatch)"')
    expect(component).not.toContain("band.outside === true ? 'url(#scale-plan-hatch)' : band.color")
  })

  /** Cor literal aqui seria escala mentindo em tema claro: tudo vem dos tokens. */
  test('takes every colour from a design token', async () => {
    const stylesheet = await readApplicationFile('src/components/ui/scale-plan.module.css')

    expect(stylesheet).not.toMatch(/#[0-9a-f]{3,8}\b/iu)
    expect(stylesheet).toContain('var(--color-')
  })
})
