/* Copyright (c) 2026 Ada Technology. MIT License. */

export type VehiclePlateModel = 'legacy' | 'mercosul' | 'unknown'

const LEGACY_PLATE = /^[A-Z]{3}\d{4}$/
const MERCOSUL_PLATE = /^[A-Z]{3}\d[A-Z]\d{2}$/

/** Tira espaço e hífen e põe em maiúscula: é o que o cadastro grava, e o que se compara. */
export function normalizeVehiclePlate(plate: string): string {
  return plate.replace(/[\s-]/g, '').toUpperCase()
}

/**
 * Pedido do usuário (10/11): o app mostra a placa no desenho do modelo dela. Mercosul é
 * `AAA1A23` (letra na 5ª posição); a antiga é `AAA1234`. Placa fora dos dois formatos (estrangeira,
 * cadastro com erro) volta `unknown` e a tela cai para texto simples — nunca desenha um modelo
 * que a placa não é.
 */
export function classifyVehiclePlate(plate: string): VehiclePlateModel {
  const normalized = normalizeVehiclePlate(plate)
  if (MERCOSUL_PLATE.test(normalized)) return 'mercosul'
  if (LEGACY_PLATE.test(normalized)) return 'legacy'
  return 'unknown'
}

/** O texto que a placa mostra: a antiga leva hífen (`ABC-1234`), a Mercosul não. */
export function formatVehiclePlateText(plate: string): string {
  const normalized = normalizeVehiclePlate(plate)
  return classifyVehiclePlate(plate) === 'legacy'
    ? `${normalized.slice(0, 3)}-${normalized.slice(3)}`
    : normalized
}
