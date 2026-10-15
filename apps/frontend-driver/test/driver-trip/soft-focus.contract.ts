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

const SMOOTH_HEIGHT = readSource('src/modules/driver-trip/components/SmoothHeight.component.tsx')
const SMOOTH_HEIGHT_STYLES = readSource('src/modules/driver-trip/styles/smoothHeight.module.css')

/** Pedido do usuário (14/10): até a confirmação da imagem muda de altura com transição. */
describe('a altura do bloco de captura muda com transição', () => {
  it('a altura medida do miolo é animada, só para quem não pediu movimento reduzido', () => {
    expect(SMOOTH_HEIGHT_STYLES).toInclude('height: var(--smooth-height, auto)')
    const media = SMOOTH_HEIGHT_STYLES.slice(
      SMOOTH_HEIGHT_STYLES.indexOf('@media (prefers-reduced-motion: no-preference)'),
    )
    expect(media).toInclude('transition: height 200ms ease-out')
    const outside = SMOOTH_HEIGHT_STYLES.slice(
      0,
      SMOOTH_HEIGHT_STYLES.indexOf('@media (prefers-reduced-motion: no-preference)'),
    )
    expect(outside).not.toInclude('transition')
  })

  it('o anel de foco do que está na borda não é cortado', () => {
    expect(SMOOTH_HEIGHT_STYLES).toInclude('overflow: clip')
    expect(SMOOTH_HEIGHT_STYLES).toInclude('overflow-clip-margin: 0.5rem')
  })

  it('a medida vem do ResizeObserver e sem ele o bloco fica com a altura natural', () => {
    expect(SMOOTH_HEIGHT).toInclude("typeof ResizeObserver === 'undefined'")
    expect(SMOOTH_HEIGHT).toInclude('observer.disconnect()')
  })

  it('canhoto, foto e assinatura da ocorrência e "Não entreguei" usam o mesmo bloco', () => {
    for (const file of [
      'DriverStopCard',
      'OccurrencePhotoField',
      'OccurrenceSignatureField',
      'DriverNotDeliveredForm',
    ]) {
      const source = readSource(`src/modules/driver-trip/components/${file}.component.tsx`)
      expect(source).toInclude('<SmoothHeight className={styles.proofCapture}>')
      expect(source).toInclude('</SmoothHeight>')
    }
  })
})
