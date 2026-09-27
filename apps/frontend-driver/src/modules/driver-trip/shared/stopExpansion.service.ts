/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Pedido do usuário (25/09): "registrei uma ocorrência e nada aconteceu? fico confuso, fica
 * misturado tudo" — cada parada vira expansível, e a atual abre sozinha e destacada. O aberto é
 * **derivado**, nunca um `useEffect` sincronizando estado: sem sobrescrita, a parada abre se for a
 * atual; com sobrescrita (o motorista tocou), ela manda até a próxima re-renderização. Quando a
 * parada atual se resolve, a próxima atual não tem sobrescrita nenhuma — abre sozinha, de graça.
 */
export type StopExpansionOverrides = ReadonlyMap<string, boolean>

export function isStopOpen(input: {
  readonly currentStopId: string | undefined
  readonly overrides: StopExpansionOverrides
  readonly stopId: string
}): boolean {
  const override = input.overrides.get(input.stopId)
  if (override !== undefined) return override
  return input.stopId === input.currentStopId
}

/** Toque no cabeçalho: grava o contrário do que está aberto agora — nunca um `!isOpen` cego depois. */
export function toggleStopOverride(input: {
  readonly currentStopId: string | undefined
  readonly overrides: StopExpansionOverrides
  readonly stopId: string
}): StopExpansionOverrides {
  const wasOpen = isStopOpen(input)
  const next = new Map(input.overrides)
  next.set(input.stopId, !wasOpen)
  return next
}
