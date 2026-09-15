/* Copyright (c) 2026 Ada Technology. MIT License. */
export { formatPostalCode, stripPostalCode } from '@/modules/shared/postalCode.service'

const CITY_CODE_LENGTH = 7

/** Nenhum corte por tamanho maior: dígito excedente continua visível para a validação acusar. */
export function stripCityCode(value: string): string {
  return value.replace(/\D/g, '')
}

/** Máscara de 7 dígitos do código IBGE — sem separador, só o teto de tamanho normal de digitação. */
export function formatCityCode(value: string): string {
  return stripCityCode(value).slice(0, CITY_CODE_LENGTH)
}
