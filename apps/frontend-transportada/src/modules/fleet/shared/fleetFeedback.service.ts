/* Copyright (c) 2026 Ada Technology. MIT License. */
import { FLEET_FEEDBACK_KEY_BY_ERROR } from './fleet.constant'

const FLEET_SAVE_ERROR_KEY = 'saveError'

/**
 * O código do erro é a `message` que o cliente HTTP lança. Código sem texto próprio cai no genérico
 * de gravação: mostrar o código cru ao operador não diz nada, e não mostrar nada esconde a falha.
 */
export function resolveFleetFeedbackKey(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  return FLEET_FEEDBACK_KEY_BY_ERROR[code] ?? FLEET_SAVE_ERROR_KEY
}
