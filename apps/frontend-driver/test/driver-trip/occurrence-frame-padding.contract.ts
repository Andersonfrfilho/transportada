/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const styles = readFileSync(
  new URL('../../src/modules/driver-trip/styles/driverTrip.module.css', import.meta.url),
  'utf8',
)

function readRuleBody(selector: string): string {
  const withoutComments = styles.replaceAll(/\/\*[\s\S]*?\*\//g, '')
  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if ((match[1] ?? '').trim() === selector) return match[2] ?? ''
  }
  throw new Error(`REGRA_AUSENTE:${selector}`)
}

/**
 * Spec 247 T7.4x: o formulário do registro vive dentro do cartão `.document`, e é esse cartão que
 * dá o recuo interno (medido: 12 px do campo à borda do cartão, em 375/768/1280). Sem o recuo, o
 * conteúdo encosta na borda — o defeito que o usuário viu no arnês, que não tinha o cartão.
 */
describe('o cartão da nota mantém o recuo interno do registro de ocorrência (spec 247 T7.4x)', () => {
  test('.document tem borda e recuo por token, e o formulário não anula o recuo', () => {
    const card = readRuleBody('.document')
    expect(card).toMatch(/padding:\s*var\(--space-3\)/)
    expect(card).toMatch(/border:\s*1px solid/)

    const form = readRuleBody('.occurrenceForm')
    expect(form).not.toMatch(/margin[^;]*-/)
    expect(form).not.toMatch(/(?<![\w-])width\s*:\s*calc\(100%\s*\+/)
  })
})
