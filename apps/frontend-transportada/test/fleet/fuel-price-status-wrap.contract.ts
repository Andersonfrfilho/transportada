/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

const STYLESHEET = (
  await Bun.file(new URL('../../src/modules/fleet/styles/fleet.module.css', import.meta.url)).text()
).replace(/\/\*[\s\S]*?\*\//gu, '')

/** Declarações de todas as regras cuja lista de seletores inclui o seletor pedido. */
function readDeclarations(selector: string): ReadonlyMap<string, string> {
  const declarations = new Map<string, string>()
  for (const rule of STYLESHEET.matchAll(/([^{}@]+)\{([^{}]*)\}/gu)) {
    const selectors = (rule[1] ?? '').split(',').map((candidate) => candidate.trim())
    if (!selectors.includes(selector)) continue
    for (const declaration of (rule[2] ?? '').split(';')) {
      const [property, ...value] = declaration.split(':')
      if (property !== undefined && value.length > 0) {
        declarations.set(property.trim(), value.join(':').trim())
      }
    }
  }
  return declarations
}

describe('a mensagem de erro do painel quebra o código comprido (spec 243 B2)', () => {
  it('.fuelPriceStatusError aceita quebra em qualquer ponto, para o código da API não alargar a aba', () => {
    expect(readDeclarations('.fuelPriceStatusError').get('overflow-wrap')).toBe('anywhere')
  })

  it('o leitor de bloco enxerga a classe pelas duas regras (agrupada e própria)', () => {
    expect(readDeclarations('.fuelPriceStatusError').get('color')).toBe('var(--color-alert)')
    expect(readDeclarations('.fuelPriceStatusError').get('font-weight')).toBe('700')
  })
})
