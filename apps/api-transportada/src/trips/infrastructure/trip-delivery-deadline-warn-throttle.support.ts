/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.2e: o painel relê o detalhe a cada 30 s (3 s com a planta pendente), e uma regra de
 * calendário ruim repetiria o mesmo aviso a cada leitura. Um aviso por viagem e código a cada cinco
 * minutos, em memória e com teto: reiniciar o processo só repete um aviso, nunca perde um.
 */
const WARN_WINDOW_MS = 5 * 60 * 1000
const MAX_TRACKED_WARNINGS = 2000

const lastWarnedAt = new Map<string, number>()

type ShouldWarnParams = {
  readonly code: string
  readonly now: Date
  readonly tripId: string
}

export function shouldWarnRefusal({ code, now, tripId }: ShouldWarnParams): boolean {
  const key = `${tripId}:${code}`
  const instant = now.getTime()
  const previous = lastWarnedAt.get(key)
  if (previous !== undefined && instant - previous < WARN_WINDOW_MS) return false

  if (lastWarnedAt.size >= MAX_TRACKED_WARNINGS) lastWarnedAt.clear()
  lastWarnedAt.set(key, instant)
  return true
}
