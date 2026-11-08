/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 RF7: bairro e cidade da parada como o motorista lê ("Centro", "Sao Joaquim da Barra"). A nota vem em
 * maiúsculas e sem acento; só se ajusta a caixa, nunca se inventa acento.
 */
const LOWERCASE_CONNECTORS = new Set(['da', 'das', 'de', 'do', 'dos', 'e'])

export function formatPlaceName(value: string | null | undefined): string | undefined {
  const words = (value ?? '').trim().split(/\s+/u).filter(Boolean)
  if (words.length === 0) return undefined
  return words
    .map((word, index) => {
      const lower = word.toLowerCase()
      if (index > 0 && LOWERCASE_CONNECTORS.has(lower)) return lower
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`
    })
    .join(' ')
}
