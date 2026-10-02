/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverFieldReport } from './driverTrip.types'

/**
 * Spec 234 D1: a nota mede o momento em que o evento nasceu no aparelho, corrigido pelo desvio do
 * relógio dele contra o servidor — a rede lenta não é culpa do motorista. O desvio é medido a cada
 * resposta bem-sucedida da API e carimbado no item da fila **na criação** (D2).
 */

/** O que o item da fila entrega ao envio: a hora do toque (crua, do aparelho) e o desvio daquele instante. */
export type EventClockStamp = Readonly<{ clockOffsetMs: number; tappedAt: string }>

/**
 * ⚠️ Os esquemas da API são `.strict()`: só estes aceitam `tappedAt`/`clockOffsetMs`, e mandá-los em
 * outro `kind` dá `400` e derruba o item. `depart`/`cancelDeparture` já levam `tappedAt` próprio
 * (spec 206), `dispatch` e `proofReceiver` não têm hora de evento, e a ocorrência de nota usa outra rota.
 */
export const CLOCK_FIELD_REPORT_KINDS = [
  'arrive',
  'deliver',
  'occurrence',
  'return',
  'stopOccurrencePhoto',
] as const satisfies readonly DriverFieldReport['kind'][]

export type ClockFieldReportKind = (typeof CLOCK_FIELD_REPORT_KINDS)[number]

export function acceptsClockFields(kind: DriverFieldReport['kind']): kind is ClockFieldReportKind {
  return (CLOCK_FIELD_REPORT_KINDS as readonly string[]).includes(kind)
}

/** Os campos que o corpo do relato ganha; vazio quando o `kind` não os aceita ou não há carimbo. */
export function buildClockFields(input: {
  readonly kind: DriverFieldReport['kind']
  readonly stamp: EventClockStamp | undefined
}): Readonly<{ clockOffsetMs?: number; tappedAt?: string }> {
  if (input.stamp === undefined || !acceptsClockFields(input.kind)) return {}
  return { clockOffsetMs: input.stamp.clockOffsetMs, tappedAt: input.stamp.tappedAt }
}

/** Item sem `clockOffsetMs` (criado sem desvio medido, ou antes da spec) não tem carimbo. */
export function toEventClockStamp(
  item: Readonly<{ clockOffsetMs?: number; createdAt: string }>,
): EventClockStamp | undefined {
  if (item.clockOffsetMs === undefined) return undefined
  return { clockOffsetMs: item.clockOffsetMs, tappedAt: item.createdAt }
}

/**
 * `desvio = hora do servidor − hora do aparelho`: positivo com o aparelho atrasado, e é o que a API
 * soma ao `tappedAt`. O `Date` do HTTP tem resolução de 1 s; o erro de até ±1 s é irrelevante para a
 * janela de 24 h do comprovante.
 */
export function computeClockOffsetMs(input: {
  readonly deviceNowMs: number
  readonly serverDateHeader: string | null
}): number | undefined {
  if (input.serverDateHeader === null) return undefined
  const serverMs = Date.parse(input.serverDateHeader)
  if (!Number.isFinite(serverMs) || !Number.isFinite(input.deviceNowMs)) return undefined
  return Math.round(serverMs - input.deviceNowMs)
}

export type ClockOffsetStore = Readonly<{
  read: () => number | undefined
  write: (offsetMs: number) => void
}>

export function createClockOffsetStore(): ClockOffsetStore {
  let latest: number | undefined
  return {
    read: () => latest,
    write: (offsetMs) => {
      latest = offsetMs
    },
  }
}

/** Só em memória: um desvio velho não sobrevive à sessão, a primeira resposta do boot o refaz. */
export const driverClockOffset: ClockOffsetStore = createClockOffsetStore()
