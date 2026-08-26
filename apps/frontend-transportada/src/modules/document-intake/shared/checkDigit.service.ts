/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 048: **o que não fecha não se preenche.** Dígito que não confere é erro de leitura ou
 * documento adulterado — nos dois casos o campo fica vazio com o motivo à vista, em vez de entrar
 * um documento inválido que só falha no `POST`.
 *
 * Tudo offline, no navegador: não há convênio com Detran, ANTT ou Receita, e o dígito verificador é
 * exatamente o que se confere **sem perguntar a ninguém**.
 */

const CPF_LENGTH = 11
const CNPJ_LENGTH = 14
const RENAVAM_LENGTH = 11

/** Documento de dígito repetido passa na conta e não existe: `111.111.111-11` fecha o verificador. */
function hasSingleRepeatedCharacter(value: string): boolean {
  return new Set(value).size === 1
}

function computeModulus11(digits: readonly number[], weights: readonly number[]): number {
  const sum = digits.reduce((total, digit, index) => total + digit * (weights[index] ?? 0), 0)
  const remainder = sum % 11

  return remainder < 2 ? 0 : 11 - remainder
}

export function isValidCpf(value: string): boolean {
  const digits = value.replace(/\D/gu, '')
  if (digits.length !== CPF_LENGTH || hasSingleRepeatedCharacter(digits)) return false

  const numbers = [...digits].map(Number)
  const first = computeModulus11(numbers.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2])
  const second = computeModulus11(numbers.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])

  return numbers[9] === first && numbers[10] === second
}

/**
 * CNPJ alfanumérico (IN RFB 2229/2024): as doze posições da base aceitam letra, e o valor de cada
 * caractere é `código ASCII − 48` — `'0'` vale 0 e `'A'` vale 17. Os dois dígitos finais continuam
 * numéricos. Tratar a base como número puro recusaria todo CNPJ emitido a partir de julho de 2026.
 */
export function isValidCnpj(value: string): boolean {
  const cleaned = value.replace(/[^0-9A-Za-z]/gu, '').toUpperCase()
  if (cleaned.length !== CNPJ_LENGTH || hasSingleRepeatedCharacter(cleaned)) return false
  if (!/^[A-Z0-9]{12}[0-9]{2}$/u.test(cleaned)) return false

  const values = [...cleaned].map((character) => character.charCodeAt(0) - 48)
  const first = computeModulus11(values.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const second = computeModulus11(values.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])

  return values[12] === first && values[13] === second
}

/**
 * RENAVAM: onze dígitos, o último verificador. Os dez primeiros são pesados de 2 a 9 da direita
 * para a esquerda, e o resultado é o dobro da soma — a conta do Denatran, que não é módulo 11 puro.
 *
 * Registro antigo tem menos de onze dígitos e se completa com zero à esquerda; recusar por tamanho
 * rejeitaria veículo de verdade.
 */
export function isValidRenavam(value: string): boolean {
  const digits = value.replace(/\D/gu, '').padStart(RENAVAM_LENGTH, '0')
  if (digits.length !== RENAVAM_LENGTH || hasSingleRepeatedCharacter(digits)) return false

  const numbers = [...digits].map(Number)
  const weights = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const sum = numbers
    .slice(0, 10)
    .reduce((total, digit, index) => total + digit * (weights[index] ?? 0), 0)
  const remainder = (sum * 10) % 11

  return (remainder === 10 ? 0 : remainder) === numbers[10]
}

const PLATE_PATTERN = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/u
/** Chassi não usa I, O nem Q — elas se confundem com 1 e 0, e o padrão as exclui. */
const CHASSIS_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/u

export function isValidPlate(value: string): boolean {
  return PLATE_PATTERN.test(value.toUpperCase().replace(/[^A-Z0-9]/gu, ''))
}

export function isValidChassis(value: string): boolean {
  return CHASSIS_PATTERN.test(value.toUpperCase().replace(/[^A-Z0-9]/gu, ''))
}

export const BRAZILIAN_STATES = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
] as const

export function isValidState(value: string): boolean {
  return (BRAZILIAN_STATES as readonly string[]).includes(value.toUpperCase().trim())
}
