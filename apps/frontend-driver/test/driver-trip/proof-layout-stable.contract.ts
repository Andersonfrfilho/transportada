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
  it('a miniatura ocupa a largura toda numa altura fixa, a mesma da moldura vazia e da confirmada', () => {
    const thumbnail = ruleBody('.proofCaptureThumbnail')
    expect(thumbnail).toContain('height: var(--proof-photo-area)')
    expect(thumbnail).toContain('width: 100%')
    expect(thumbnail).toContain('object-fit: contain')
    expect(thumbnail).not.toContain('height: auto')
    expect(ruleBody('.proofConfirmedThumbnail')).toContain('height: var(--proof-photo-area)')
    expect(ruleBody('.proofEmptyFrame')).toContain('min-height: var(--proof-photo-area)')
    expect(ruleBody('.proofCaptureAttached')).toContain('--proof-photo-area:')
  })

  it('o foco do nome do recebedor não rola a tela', () => {
    const card = readFileSync(`${root}/components/DriverStopCard.component.tsx`, 'utf8')
    expect(card).toContain('focus({ preventScroll: true })')
  })
})
