/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 150, rodada de correção da Fase 4, item 11: o `429` do limitador de taxa (`http.md` §RF18)
 * carrega `Retry-After` em segundos; a tela mostra minutos, arredondado para cima e nunca zero —
 * "tente de novo em 0 min" não diz nada ao operador.
 */
export function resolveRetryAfterMinutes(retryAfterSeconds: number): number {
  return Math.max(1, Math.ceil(retryAfterSeconds / 60))
}

/** `undefined` quando o header está ausente ou não é um número válido — nunca `NaN` adiante. */
export function readRetryAfterSecondsHeader(headers: Headers): number | undefined {
  const raw = headers.get('retry-after')
  if (raw === null) return undefined
  const seconds = Number(raw)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined
}
