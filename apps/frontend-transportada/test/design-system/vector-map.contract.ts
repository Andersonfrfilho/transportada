/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const ROOT = new URL('../..', import.meta.url)
const CSS = 'src/components/ui/vector-map.module.css'

function block(css: string, selector: string): string {
  const start = css.indexOf(selector)
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start))
}

/**
 * ⚠️ Achado em staging (2026-09-03) **pela captura de tela, não pelo DOM**: o traço da rota existia
 * com 94 vértices, a classe certa e a legenda certa — e renderizava **invisível**. Ele herdava
 * `.shape`, que é a divisa da malha do IBGE: `--color-graphite` a 70%, feita para borda de polígono
 * preenchido sobre fundo claro, e praticamente o próprio fundo escuro desta tela.
 *
 * A lição fica no contrato porque a conferência por DOM não a alcança: `d`, `class` e `aria-label`
 * estavam todos corretos. Só a cor computada contra o fundo dizia a verdade.
 */
describe('o traço de linha não herda a cor da divisa (spec 079)', () => {
  const css = readFileSync(new URL(CSS, ROOT), 'utf8')

  test('a linha tem cor própria, e não a da borda de polígono', () => {
    expect(css).toInclude('.line {')
    expect(block(css, '.line {')).toInclude('stroke:')
    expect(block(css, '.line {')).not.toInclude('--color-graphite')
  })

  /** Traço mais grosso que divisa: a rota é o que se lê primeiro no mapa, não o contorno. */
  test('a linha é mais grossa que a divisa', () => {
    const divisa = Number(/stroke-width:\s*([\d.]+)/u.exec(block(css, '.shape {'))?.[1])
    const linha = Number(/stroke-width:\s*([\d.]+)/u.exec(block(css, '.line {'))?.[1])

    expect(linha).toBeGreaterThan(divisa)
  })

  /** O tracejado só significa alguma coisa se o traço for visível — ele acompanha a linha. */
  test('o tracejado existe para a linha, não para a divisa', () => {
    expect(block(css, '.dashed {')).toInclude('stroke-dasharray')
  })
})
