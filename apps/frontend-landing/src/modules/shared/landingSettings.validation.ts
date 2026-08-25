/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Mesmo padrão do CHECK do banco (`landing.schema.ts` na API): hex de 6 dígitos, sem atalho de 3. */
const ACCENT_COLOR_PATTERN = /^#[0-9a-f]{6}$/u

/**
 * Cor inválida nunca vaza para o CSS: cai no token padrão do app. A fronteira aqui é a resposta
 * pública — ela pode vir de uma configuração salva por outro caminho, e a página não pode confiar
 * cegamente nela.
 */
export function sanitizeAccentColor(value: unknown): string | undefined {
  return typeof value === 'string' && ACCENT_COLOR_PATTERN.test(value) ? value : undefined
}

export function sanitizeOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}
