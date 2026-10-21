/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Nome de pessoa na tela: primeiras letras maiúsculas, partículas ("de", "da", "dos"...) em minúsculas.
 * Formata só na exibição — o dado gravado não muda.
 */
const LOWERCASE_PARTICLES: ReadonlySet<string> = new Set(['da', 'das', 'de', 'do', 'dos', 'e'])

export function formatPersonName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '')
    .map((word, index) => {
      const lower = word.toLocaleLowerCase('pt-BR')
      if (index > 0 && LOWERCASE_PARTICLES.has(lower)) return lower
      return lower.replace(
        /(^|[-'’])(\p{L})/gu,
        (_m, sep: string, letter: string) => sep + letter.toLocaleUpperCase('pt-BR'),
      )
    })
    .join(' ')
}
