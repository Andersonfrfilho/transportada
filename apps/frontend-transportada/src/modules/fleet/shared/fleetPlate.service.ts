import { normalizePlate } from './fleetForm.service'

const PLATE_LENGTH = 7
const PLATE_PREFIX_LENGTH = 3
const PLATE_STANDARD_POSITION = 4
const DIGIT_PATTERN = /^[0-9]$/

export const PLATE_STANDARD = {
  LEGACY: 'legacy',
  MERCOSUL: 'mercosul',
} as const

export type PlateStandard = (typeof PLATE_STANDARD)[keyof typeof PLATE_STANDARD]

export type PlateGroups = Readonly<{
  prefix: readonly string[]
  suffix: readonly string[]
}>

/**
 * Só o caixa muda durante a digitação: remover caractere aqui move o cursor do operador sozinho,
 * e o hífen do padrão antigo continua sendo removido pelo `normalizePlate` no envio.
 */
export function toPlateInput(value: string): string {
  return value.toUpperCase()
}

/**
 * Distribui o que foi digitado nas sete posições impressas na placa. O padrão antigo e o
 * Mercosul têm o mesmo tamanho, então a miniatura serve aos dois sem saber qual é qual.
 */
export function describePlateCharacters(value: string): readonly string[] {
  const normalized = normalizePlate(value).slice(0, PLATE_LENGTH)

  return Array.from({ length: PLATE_LENGTH }, (_, position) => normalized[position] ?? '')
}

/**
 * A quinta posição é a única que separa os dois padrões — letra no Mercosul, dígito no antigo.
 * Enquanto ela não foi digitada a miniatura fica no Mercosul, que é o padrão vigente.
 */
export function describePlateStandard(value: string): PlateStandard {
  const standardCharacter = normalizePlate(value)[PLATE_STANDARD_POSITION] ?? ''

  return DIGIT_PATTERN.test(standardCharacter) ? PLATE_STANDARD.LEGACY : PLATE_STANDARD.MERCOSUL
}

/** Os dois blocos que a placa impressa separa: as três primeiras posições e as quatro restantes. */
export function describePlateGroups(value: string): PlateGroups {
  const characters = describePlateCharacters(value)

  return {
    prefix: characters.slice(0, PLATE_PREFIX_LENGTH),
    suffix: characters.slice(PLATE_PREFIX_LENGTH),
  }
}
