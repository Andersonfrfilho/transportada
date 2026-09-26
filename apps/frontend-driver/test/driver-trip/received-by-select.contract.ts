/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

function readComponentSource(): string {
  return readFileSync(
    new URL(
      '../../src/modules/driver-trip/components/DriverStopCard.component.tsx',
      import.meta.url,
    ),
    'utf8',
  )
}

/**
 * Pedido do usuário (25/09, spec 207): "select fora do padrão" — o `<select>` nativo tinha 10
 * opções, acima do limite de ~8 do `web.md` §11. `DriverStopCard` não pode ter select nativo
 * nenhum; "Quem recebeu" usa o `Select` do design system (copiado por valor do painel).
 */
describe('"Quem recebeu" usa o Select do design system, nunca <select> nativo (spec 207)', () => {
  it('nenhum <select nativo em DriverStopCard', () => {
    const card = readComponentSource()
    expect(card).not.toContain('<select')
    expect(card).not.toContain('</select>')
  })

  it('importa e usa o Select do design system', () => {
    const card = readComponentSource()
    expect(card).toContain("import { Select } from '@/components/ui/select'")
    expect(card).toContain('<Select')
  })

  it('as opções vêm de RECEIVED_BY_OPTIONS, sem <option> cru', () => {
    const card = readComponentSource()
    expect(card).not.toContain('<option')
    expect(card).toContain('RECEIVED_BY_OPTIONS.map')
  })

  it('o CSS do select nativo saiu de driverTrip.module.css — ele deixou de ser usado', () => {
    const css = readFileSync(
      new URL('../../src/modules/driver-trip/styles/driverTrip.module.css', import.meta.url),
      'utf8',
    )
    expect(css).not.toContain('.proofField select')
  })
})
