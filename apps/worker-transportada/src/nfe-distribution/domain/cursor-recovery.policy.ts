/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * NT 2014.002 §3.11.4.1 tem duas causas de consumo indevido e a resposta certa é oposta em cada uma.
 * A causa 1 (nada novo a buscar) só ocorre depois de um `cStat 137`, e ali `ultNSU == maxNSU` por
 * construção: mexer no cursor abandonaria documento à toa. Cursor atrás da marca d'água com recusa
 * repetida é, necessariamente, a causa 2 — consulta fora de sequência, que se renova a cada hora
 * até alguém mover o cursor.
 */
const CONSECUTIVE_REFUSALS_BEFORE_RESYNC = 2

export type CursorRecoveryDecision =
  | { readonly kind: 'resync' }
  | { readonly consecutiveRateLimits: number; readonly kind: 'wait' }

export function decideCursorRecovery(input: {
  readonly consecutiveRateLimits: number
  readonly maxNsu: string
  readonly ultNsu: string
}): CursorRecoveryDecision {
  const consecutiveRateLimits = input.consecutiveRateLimits + 1
  const isBehindWatermark = input.ultNsu < input.maxNsu

  // Duas e não uma: a primeira recusa pode ser colisão comum com a janela de uma hora
  if (isBehindWatermark && consecutiveRateLimits >= CONSECUTIVE_REFUSALS_BEFORE_RESYNC) {
    return { kind: 'resync' }
  }

  return { consecutiveRateLimits, kind: 'wait' }
}
