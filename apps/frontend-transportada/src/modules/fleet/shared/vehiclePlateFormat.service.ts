/* Copyright (c) 2026 Ada Technology. MIT License. */
import { normalizePlate } from './fleetForm.service'

const PLATE_LENGTH = 7
const PLATE_PREFIX_LENGTH = 3

/**
 * A placa guardada é alfanumérica sem separador, e é assim que o sistema a compara. Na tela ela é
 * lida por gente: o traço depois das três letras separa o que se soletra do que se confere, e vale
 * para o padrão antigo (`ABC-1234`) e para o Mercosul (`RTD-5J78`) — a divisão é a mesma.
 *
 * Placa fora dos sete caracteres sai normalizada e sem traço: cadastro incompleto ou identificador
 * estrangeiro não pode virar um traço no meio de um dado que não tem essa forma.
 */
export function formatVehiclePlate(value: string): string {
  const plate = normalizePlate(value)
  if (plate.length !== PLATE_LENGTH) return plate
  return `${plate.slice(0, PLATE_PREFIX_LENGTH)}-${plate.slice(PLATE_PREFIX_LENGTH)}`
}
