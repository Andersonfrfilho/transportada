/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * A alíquota é **percentual** no fio, fração aqui dentro. O domínio guarda `0.020000` porque é assim
 * que se multiplica o valor do serviço; a prefeitura lê o mesmo campo como porcentagem e recusa com
 * `E227 — Alíquota Serviços fora do intervalo de 2% e 5%` quando recebe `0.02`. Medido em produção
 * em 18/08/2026, na nota 5253521.
 *
 * A conversão é textual, não aritmética: `Number` traria erro binário para dentro de campo fiscal.
 */
export function toIssRatePercentage(value: string): string {
  const negative = value.trimStart().startsWith('-')
  const [whole = '0', fraction = ''] = value.replace(/^\s*[+-]?/u, '').split('.')
  const padded = fraction.padEnd(2, '0')
  const digits = `${whole}${padded}`
  const decimalPlaces = padded.length - 2
  const integerPart = digits.slice(0, digits.length - decimalPlaces)
  const decimalPart = digits.slice(digits.length - decimalPlaces)
  const shifted = decimalPart.length === 0 ? integerPart : `${integerPart}.${decimalPart}`
  const trimmed = trimInsignificantZeros(shifted)
  return negative && trimmed !== '0' ? `-${trimmed}` : trimmed
}

function trimInsignificantZeros(value: string): string {
  const withoutTrailing = value.includes('.')
    ? value.replace(/0+$/u, '').replace(/\.$/u, '')
    : value
  const withoutLeading = withoutTrailing.replace(/^0+(?=\d)/u, '')
  return withoutLeading.length === 0 ? '0' : withoutLeading
}
