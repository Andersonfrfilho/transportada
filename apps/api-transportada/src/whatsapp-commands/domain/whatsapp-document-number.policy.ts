/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O motorista digita o número da nota como vê no papel: "916.075", "916-075" ou "916 075". Aqui o
 * número volta a ser só dígitos ("916075"). Só junta quando o resto é grupo de 3 dígitos (milhar),
 * para "parada 3 nota 5" ou "2 4" continuarem sendo números separados.
 */
const GROUPED_NUMBER = /\d{1,3}(?:[.\-\s]\d{3})+(?!\d)/gu

export function joinGroupedDocumentNumbers(text: string): string {
  return text.replace(GROUPED_NUMBER, (match) => match.replace(/[.\-\s]/gu, ''))
}
