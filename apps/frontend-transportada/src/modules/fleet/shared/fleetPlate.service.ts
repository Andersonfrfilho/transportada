/* Copyright (c) 2026 Ada Technology. MIT License. */
import { normalizePlate } from './fleetForm.service'

const MERCOSUL_PLATE_LENGTH = 7

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
  const normalized = normalizePlate(value).slice(0, MERCOSUL_PLATE_LENGTH)

  return Array.from({ length: MERCOSUL_PLATE_LENGTH }, (_, position) => normalized[position] ?? '')
}
