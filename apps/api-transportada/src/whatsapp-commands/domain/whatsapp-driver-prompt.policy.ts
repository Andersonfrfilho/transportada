/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RNF1: **o pedido em aberto da conversa individual** que não é uma entrega nem uma ocorrência em
 * coleta — a oferta da próxima rota, o pedido de localização, a conferência de fora de ordem. Mora no
 * contexto da sessão (só ids, a hora e marcadores; nunca nome, endereço nem coordenada) e há **um só** por
 * conversa. No grupo o mesmo papel é do passo do pedido aberto.
 */
export const DRIVER_PROMPT_CONTEXT_KEY = 'driverPrompt'

/** Pedido esquecido (o motorista seguiu a vida) não responde "1" horas depois. */
export const DRIVER_PROMPT_TTL_MS = 2 * 60 * 60 * 1000

/** Respostas que não cabem no pedido de localização até ele ser abandonado (o mesmo teto do grupo). */
export const DRIVER_PROMPT_MAX_ATTEMPTS = 3

export const DRIVER_PROMPT_KIND = { location: 'location', routeOffer: 'route_offer' } as const

type PromptBase = {
  readonly documentNumber?: string | undefined
  readonly offeredAt: string
  readonly stopId: string
}

export type DriverPrompt =
  | (PromptBase & { readonly kind: typeof DRIVER_PROMPT_KIND.routeOffer })
  | (PromptBase & {
      readonly attempts: number
      readonly event: 'arrive' | 'depart'
      readonly kind: typeof DRIVER_PROMPT_KIND.location
    })

/** O contexto é jsonb persistido: confere o formato e a validade em vez de confiar nele. */
export function readDriverPrompt(
  context: Record<string, unknown>,
  now: Date,
): DriverPrompt | undefined {
  const value = context[DRIVER_PROMPT_CONTEXT_KEY]
  if (typeof value !== 'object' || value === null) return undefined
  const { attempts, documentNumber, event, kind, offeredAt, stopId } = value as Record<
    string,
    unknown
  >
  if (typeof stopId !== 'string' || typeof offeredAt !== 'string') return undefined
  const offered = new Date(offeredAt).getTime()
  if (Number.isNaN(offered) || now.getTime() - offered > DRIVER_PROMPT_TTL_MS) return undefined
  const base = {
    documentNumber: typeof documentNumber === 'string' ? documentNumber : undefined,
    offeredAt,
    stopId,
  }
  if (kind === DRIVER_PROMPT_KIND.routeOffer) return { ...base, kind }
  if (kind === DRIVER_PROMPT_KIND.location && (event === 'arrive' || event === 'depart')) {
    return { ...base, attempts: typeof attempts === 'number' ? attempts : 0, event, kind }
  }
  return undefined
}

export function withoutDriverPrompt(context: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(context).filter(([key]) => key !== DRIVER_PROMPT_CONTEXT_KEY),
  )
}
