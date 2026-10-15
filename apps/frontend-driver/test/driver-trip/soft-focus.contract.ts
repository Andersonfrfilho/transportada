/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { resolveScrollBehavior } from '../../src/modules/driver-trip/shared/scrollBehavior.service'

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

const GLOBAL_STYLES = readSource('src/styles/index.css')
const WORKSPACE = readSource('src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx')
const OCCURRENCE_FORM = readSource(
  'src/modules/driver-trip/components/DriverOccurrenceRegistrationForm.component.tsx',
)

/** Pedido do usuário (14/10): o foco é suave — o anel não aparece seco e a tela não pula. */
describe('o anel de foco aparece com fade', () => {
  it('todo controle nasce com anel transparente e só ganha cor no foco por teclado', () => {
    expect(GLOBAL_STYLES).toMatch(
      /:where\([^)]*button[^)]*\)\s*\{[^}]*outline:\s*2px solid transparent/,
    )
    expect(GLOBAL_STYLES).toMatch(
      /:where\([^)]*button[^)]*\):focus-visible\s*\{[^}]*outline-color:\s*color-mix/,
    )
  })

  it('o fade é de cor, curto e só para quem não pediu movimento reduzido', () => {
    const media = GLOBAL_STYLES.slice(
      GLOBAL_STYLES.indexOf('@media (prefers-reduced-motion: no-preference)'),
    )
    expect(media).toInclude('transition: outline-color 160ms ease-out')
  })

  it('o botão do design system não perde o fade do anel ao definir a própria transição', () => {
    const rule = GLOBAL_STYLES.slice(GLOBAL_STYLES.indexOf('.ui-button {'))
    expect(rule.slice(0, rule.indexOf('}'))).toInclude('outline-color 160ms ease-out')
  })
})

describe('a tela rola suave até o foco, sem pular', () => {
  it('o foco programático não rola por conta própria (a rolagem é a suave)', () => {
    expect(WORKSPACE).toInclude('element.focus({ preventScroll: true })')
    expect(WORKSPACE).not.toMatch(/element\.focus\(\)/)
    expect(OCCURRENCE_FORM).toInclude('panelRef.current?.focus({ preventScroll: true })')
  })

  it('a rolagem até a parada usa a preferência de movimento', () => {
    expect(WORKSPACE).toInclude('behavior: resolveScrollBehavior()')
  })

  it('suave por padrão, direta com movimento reduzido, suave sem matchMedia', () => {
    expect(resolveScrollBehavior(() => ({ matches: false }))).toBe('smooth')
    expect(resolveScrollBehavior(() => ({ matches: true }))).toBe('auto')
    expect(resolveScrollBehavior(undefined)).toBe('smooth')
  })
})
