/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RNF1: **o pedido em aberto da conversa individual** que não é uma entrega nem uma ocorrência em
 * coleta — a oferta da próxima rota, o pedido de localização, a conferência de fora de ordem. Mora no
 * contexto da sessão (só ids e a hora; nunca nome, endereço nem coordenada) e há **um só** por conversa.
 * No grupo o mesmo papel é do passo do pedido aberto.
 */
export const DRIVER_PROMPT_CONTEXT_KEY = 'driverPrompt'

/** Pedido esquecido (o motorista seguiu a vida) não responde "1" horas depois. */
export const DRIVER_PROMPT_TTL_MS = 2 * 60 * 60 * 1000

export const DRIVER_PROMPT_KIND = { routeOffer: 'route_offer' } as const

export type DriverPrompt = {
  readonly documentNumber?: string | undefined
  readonly kind: (typeof DRIVER_PROMPT_KIND)[keyof typeof DRIVER_PROMPT_KIND]
  readonly offeredAt: string
  readonly stopId: string
}

/** O contexto é jsonb persistido: confere o formato e a validade em vez de confiar nele. */
export function readDriverPrompt(
  context: Record<string, unknown>,
  now: Date,
): DriverPrompt | undefined {
  const value = context[DRIVER_PROMPT_CONTEXT_KEY]
  if (typeof value !== 'object' || value === null) return undefined
  const { documentNumber, kind, offeredAt, stopId } = value as Record<string, unknown>
  if (kind !== DRIVER_PROMPT_KIND.routeOffer) return undefined
  if (typeof stopId !== 'string' || typeof offeredAt !== 'string') return undefined
  const offered = new Date(offeredAt).getTime()
  if (Number.isNaN(offered) || now.getTime() - offered > DRIVER_PROMPT_TTL_MS) return undefined
  return {
    documentNumber: typeof documentNumber === 'string' ? documentNumber : undefined,
    kind,
    offeredAt,
    stopId,
  }
}

export function withoutDriverPrompt(context: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(context).filter(([key]) => key !== DRIVER_PROMPT_CONTEXT_KEY),
  )
}
