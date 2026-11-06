/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RNF1: **o pedido em aberto da conversa individual** que não é uma entrega nem uma ocorrência em
 * coleta — a oferta da próxima rota, o pedido de localização, a conferência de fora de ordem. Mora no
 * contexto da sessão (só ids, a hora e marcadores; nunca nome, endereço nem coordenada) e há **um só** por
 * conversa. No grupo o mesmo papel é do passo do pedido aberto.
 */
import { readJourneyActions, type JourneyAction } from './whatsapp-driver-journey.policy.js'

export const DRIVER_PROMPT_CONTEXT_KEY = 'driverPrompt'

/** Pedido esquecido (o motorista seguiu a vida) não responde "1" horas depois. */
export const DRIVER_PROMPT_TTL_MS = 2 * 60 * 60 * 1000

/** Respostas que não cabem no pedido de localização até ele ser abandonado (o mesmo teto do grupo). */
export const DRIVER_PROMPT_MAX_ATTEMPTS = 3

export const DRIVER_PROMPT_TEXT = {
  cancelled: 'Certo, cancelei e não registrei nada.',
} as const

export const DRIVER_PROMPT_KIND = {
  /** O menu das ações da parada (evento repetido, baixa pendente, próxima rota). */
  journeyActions: 'journey_actions',
  location: 'location',
  outOfOrder: 'out_of_order',
  routeOffer: 'route_offer',
  /** A lista das paradas pendentes para escolher a saída. */
  stopChoice: 'stop_choice',
} as const

/** Uma parada da lista de escolha: só o id e os números das notas. */
export type DriverPromptStopOption = {
  readonly id: string
  readonly numbers: readonly string[]
}

type PromptBase = {
  readonly documentNumber?: string | undefined
  readonly offeredAt: string
  readonly stopId: string
}

export type DriverPrompt =
  | (PromptBase & { readonly kind: typeof DRIVER_PROMPT_KIND.routeOffer })
  | (PromptBase & {
      readonly attempts: number
      /** O motorista já confirmou sair com a baixa de outra parada pendente. */
      readonly confirmOutOfOrder?: boolean
      readonly event: 'arrive' | 'depart'
      readonly kind: typeof DRIVER_PROMPT_KIND.location
    })
  /** Spec 294 RF25: a API recusou a etapa por estar fora da ordem; 1 confirma, 2 descarta (ou, na saída, vai à próxima). */
  | (PromptBase & {
      readonly event: 'arrive' | 'depart'
      readonly kind: typeof DRIVER_PROMPT_KIND.outOfOrder
      readonly nextStopId: string | undefined
    })
  | (PromptBase & {
      readonly actions: readonly JourneyAction[]
      readonly kind: typeof DRIVER_PROMPT_KIND.journeyActions
    })
  | (PromptBase & {
      /** O motorista já confirmou sair com a baixa de outra parada pendente. */
      readonly confirmOutOfOrder: boolean
      readonly kind: typeof DRIVER_PROMPT_KIND.stopChoice
      readonly stops: readonly DriverPromptStopOption[]
    })

/** O contexto é jsonb persistido: confere o formato e a validade em vez de confiar nele. */
export function readDriverPrompt(
  context: Record<string, unknown>,
  now: Date,
): DriverPrompt | undefined {
  const value = context[DRIVER_PROMPT_CONTEXT_KEY]
  if (typeof value !== 'object' || value === null) return undefined
  const {
    actions,
    attempts,
    confirmOutOfOrder,
    documentNumber,
    event,
    kind,
    nextStopId,
    offeredAt,
    stopId,
    stops,
  } = value as Record<string, unknown>
  if (typeof stopId !== 'string' || typeof offeredAt !== 'string') return undefined
  const offered = new Date(offeredAt).getTime()
  if (Number.isNaN(offered) || now.getTime() - offered > DRIVER_PROMPT_TTL_MS) return undefined
  const base = {
    documentNumber: typeof documentNumber === 'string' ? documentNumber : undefined,
    offeredAt,
    stopId,
  }
  if (kind === DRIVER_PROMPT_KIND.routeOffer) return { ...base, kind }
  if (kind === DRIVER_PROMPT_KIND.journeyActions) {
    const parsed = readJourneyActions(actions)
    return parsed.length === 0 ? undefined : { ...base, actions: parsed, kind }
  }
  if (kind === DRIVER_PROMPT_KIND.stopChoice) {
    const options = readStopOptions(stops)
    return options.length === 0
      ? undefined
      : { ...base, confirmOutOfOrder: confirmOutOfOrder === true, kind, stops: options }
  }
  if (kind === DRIVER_PROMPT_KIND.location && (event === 'arrive' || event === 'depart')) {
    return {
      ...base,
      attempts: typeof attempts === 'number' ? attempts : 0,
      ...(confirmOutOfOrder === true ? { confirmOutOfOrder: true } : {}),
      event,
      kind,
    }
  }
  if (kind === DRIVER_PROMPT_KIND.outOfOrder && (event === 'arrive' || event === 'depart')) {
    return {
      ...base,
      event,
      kind,
      nextStopId: typeof nextStopId === 'string' ? nextStopId : undefined,
    }
  }
  return undefined
}

function readStopOptions(value: unknown): DriverPromptStopOption[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): DriverPromptStopOption[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const { id, numbers } = entry as Record<string, unknown>
    if (typeof id !== 'string' || !Array.isArray(numbers)) return []
    return [
      { id, numbers: numbers.filter((number): number is string => typeof number === 'string') },
    ]
  })
}

export function withoutDriverPrompt(context: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(context).filter(([key]) => key !== DRIVER_PROMPT_CONTEXT_KEY),
  )
}
