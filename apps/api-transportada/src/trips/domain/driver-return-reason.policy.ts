/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Spec 057, P1 "não entreguei": lista **fechada**, escolhida com uma mão na porta do cliente. Texto
 * livre aqui vira "cliente fechado", "fechado", "tava fechado" na mesma base, e nenhuma das três
 * soma num relatório.
 *
 * O escritório continua podendo devolver com motivo em texto pela tela dele (spec 056) — a coluna é
 * a mesma, e é por isso que a lista fechada vive aqui, na fronteira do campo, e não num CHECK do
 * banco que recusaria o que o escritório já grava.
 */
export const DRIVER_RETURN_REASONS = [
  'recipient_absent',
  'recipient_refused',
  'address_not_found',
  'damaged_goods',
  'establishment_closed',
] as const
export type DriverReturnReason = (typeof DRIVER_RETURN_REASONS)[number]

export function isDriverReturnReason(value: unknown): value is DriverReturnReason {
  return (DRIVER_RETURN_REASONS as readonly unknown[]).includes(value)
}
