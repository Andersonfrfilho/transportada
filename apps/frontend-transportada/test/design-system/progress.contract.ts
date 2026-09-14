/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { resolveProgressPercent } from '@/modules/shared/progress.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): string {
  return readFileSync(new URL(filePath, APPLICATION_ROOT), 'utf8')
}

describe('barra de progresso', () => {
  /**
   * ⚠️ O percentual é aparado em 100 de propósito: `aria-valuenow` vive em 0..100, e a pista não
   * tem como desenhar 166% de largura.
   */
  test('apara o percentual entre 0 e 100', () => {
    expect(resolveProgressPercent({ completed: 69.92, total: 42.04 })).toBe(100)
    expect(resolveProgressPercent({ completed: -5, total: 10 })).toBe(0)
    /** Sem denominador não há proporção — e zero é o único valor que não inventa uma. */
    expect(resolveProgressPercent({ completed: 10, total: 0 })).toBe(0)
  })

  /**
   * ⚠️ **O estouro não pode desaparecer.** Aparado o percentual, a barra cheia de quem passou do
   * teto ficaria idêntica à de quem coube exatamente — e é justamente aí que alguém continuaria
   * carregando. A cor é o que separa os dois, e o número ao lado continua dizendo quanto passou.
   */
  test('distingue o carregamento exato do estouro', () => {
    const source = readApplicationFile('src/components/ui/progress.tsx')
    const css = readApplicationFile('src/components/ui/progress.module.css')

    expect(source).toContain('completed > total')
    expect(source).toContain('styles.indicatorOver')
    /** O completo não pode vencer o estouro: 100% exato e 166% teriam a mesma cor. */
    expect(source).toContain('percent === 100 && !isOverCapacity')
    expect(css).toContain('.indicatorOver')
    expect(css).toContain('var(--color-alert)')
  })

  /** Movimento é acessório: quem pediu menos animação continua vendo o número e a cor. */
  test('respeita prefers-reduced-motion', () => {
    expect(readApplicationFile('src/components/ui/progress.module.css')).toContain(
      'prefers-reduced-motion',
    )
  })
})
