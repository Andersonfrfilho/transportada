/* Copyright (c) 2026 Ada Technology. MIT License. */
import { formatBrazilianQuantity } from './occurrenceAmount.service'

const UNIT_VALUE_PATTERN = /^([0-9]+)(?:\.([0-9]{1,4}))?$/u
const TRAILING_ZEROS = /0+$/u
const MINIMUM_UNIT_VALUE_DECIMALS = 2

/**
 * O valor unitário da nota como a nota o traz: duas casas no mínimo, e até quatro quando elas existem
 * (`19.9950` → `19,995`). Arredondar a centavos mostraria `20,00` ao motorista e a soma da linha, que
 * parte de `19,995`, não bateria com a conta que ele faz de cabeça. Texto que não é decimal volta como veio.
 */
export function formatBrazilianUnitValue(value: string): string {
  const match = UNIT_VALUE_PATTERN.exec(value)
  if (match === null) return value

  const integer = formatBrazilianQuantity(match[1] ?? '0')
  const decimals = (match[2] ?? '')
    .replace(TRAILING_ZEROS, '')
    .padEnd(MINIMUM_UNIT_VALUE_DECIMALS, '0')
  return `${integer},${decimals}`
}
