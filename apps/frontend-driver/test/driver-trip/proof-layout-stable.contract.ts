/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'bun:test'

const root = resolve(import.meta.dir, '../../src/modules/driver-trip')
const css = readFileSync(`${root}/styles/driverTrip.module.css`, 'utf8')

function ruleBody(selector: string): string {
  const start = css.indexOf(`\n${selector} {`)
  expect(start).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('}', start))
}

describe('o cartão da foto não muda de altura ao anexar nem ao confirmar (pedido do usuário, 14/10)', () => {
  it('a miniatura anexada tem quadro fixo, igual ao da foto confirmada, e não cresce com a proporção da foto', () => {
    const thumbnail = ruleBody('.proofCaptureThumbnail')
    expect(thumbnail).toContain('height: var(--space-16)')
    expect(thumbnail).toContain('width: var(--space-16)')
    expect(thumbnail).not.toContain('height: auto')
    expect(thumbnail).not.toContain('width: 100%')
  })

  it('vazio, anexado e confirmado reservam a mesma altura mínima', () => {
    expect(ruleBody('.proofCaptureAttached')).toContain('min-height: calc(')
  })

  it('o foco do nome do recebedor não rola a tela', () => {
    const card = readFileSync(`${root}/components/DriverStopCard.component.tsx`, 'utf8')
    expect(card).toContain('focus({ preventScroll: true })')
  })
})
