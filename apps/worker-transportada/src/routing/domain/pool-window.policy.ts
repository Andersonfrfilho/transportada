/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { resolveDeliveryWindow } from './delivery-window.policy.js'

type WindowInterval = { readonly closesAt: string; readonly opensAt: string }

/** A chave é (cidade da parada, CNPJ do cliente): o feriado é da cidade, e o cliente pode ter paradas em várias. */
export type PoolWindowIntervals = ReadonlyMap<string, readonly WindowInterval[]>

export type PoolWindowStop = {
  readonly cityCode: string | null
  readonly taxIds: readonly string[]
}

export function buildPoolWindowKey(input: {
  readonly cityCode: string | null
  readonly taxId: string
}): string {
  return `${input.cityCode ?? ''}\u0000${input.taxId}`
}

type WindowSources = {
  readonly exceptions: readonly {
    readonly closesAt: string | null
    readonly deliveryClientId: string
    readonly exceptionOn: string
    readonly kind: string
    readonly opensAt: string | null
  }[]
  readonly holidays: readonly { readonly cityIbgeCode: string; readonly holidayOn: string }[]
  readonly windows: readonly {
    readonly closesAt: string
    readonly deliveryClientId: string
    readonly opensAt: string
    readonly weekday: number
  }[]
}

export function resolveStopWindows(input: {
  readonly clients: readonly { readonly id: string; readonly taxId: string }[]
  readonly date: string
  readonly sources: WindowSources
  readonly stops: readonly PoolWindowStop[]
}): PoolWindowIntervals {
  const { exceptions, holidays, windows } = input.sources
  const clientByTaxId = new Map(input.clients.map((client) => [client.taxId, client]))
  const resolved = new Map<string, readonly WindowInterval[]>()

  for (const stop of input.stops) {
    const cityHolidays = holidays
      .filter((holiday) => holiday.cityIbgeCode === stop.cityCode)
      .map((holiday) => ({ holidayOn: holiday.holidayOn }))

    for (const taxId of stop.taxIds) {
      const client = clientByTaxId.get(taxId)
      if (client === undefined) continue

      const window = resolveDeliveryWindow({
        date: input.date,
        exceptions: exceptions
          .filter((exception) => exception.deliveryClientId === client.id)
          .map((exception) => ({
            closesAt: exception.closesAt,
            exceptionOn: exception.exceptionOn,
            kind: exception.kind === 'closed' ? ('closed' as const) : ('open' as const),
            opensAt: exception.opensAt,
          })),
        holidays: cityHolidays,
        windows: windows
          .filter((row) => row.deliveryClientId === client.id)
          .map((row) => ({ closesAt: row.closesAt, opensAt: row.opensAt, weekday: row.weekday })),
      })

      /**
       * `unset` é ausência de regra e vira ausência de janela — o solver não penaliza hora nenhuma.
       * `closed` (intervalos vazios com origem declarada) é o oposto, e por isso ele **não** cai aqui:
       * ver `resolvePoolWindow`.
       */
      if (window.source === 'unset') continue
      resolved.set(buildPoolWindowKey({ cityCode: stop.cityCode, taxId }), window.intervals)
    }
  }

  return resolved
}

/**
 * ⚠️ **O solver representa uma janela por parada**, e o cliente pode ter duas (manhã e tarde). Fica a
 * **primeira** — a mais cedo —, e não o intervalo que vai da abertura ao fechamento do dia: unir os
 * dois faria o roteiro propor chegada no horário de almoço, que a portaria recusa. Perder a tarde é
 * proposta pobre; propor a hora fechada é caminhão parado no portão.
 *
 * Cliente **fechado** no dia (janela cadastrada, nenhum intervalo hoje) recebe uma janela impossível
 * — abre e fecha no mesmo instante —, que o solver trata como violação explícita em vez de esconder:
 * é a mesma regra da precisão grosseira, o operador precisa ver antes de aceitar.
 */
export function resolvePoolWindow(input: {
  readonly cityCode: string | null
  readonly offsetSeconds: number
  readonly taxIds: readonly string[]
  readonly windows: PoolWindowIntervals
}): { readonly endSeconds: number | null; readonly startSeconds: number | null } {
  for (const taxId of input.taxIds) {
    const intervals = input.windows.get(buildPoolWindowKey({ cityCode: input.cityCode, taxId }))
    if (intervals === undefined) continue

    const first = intervals[0]
    if (first === undefined) return { endSeconds: 0, startSeconds: 0 }

    return {
      endSeconds: toDaySeconds(first.closesAt) + input.offsetSeconds,
      startSeconds: toDaySeconds(first.opensAt) + input.offsetSeconds,
    }
  }

  return { endSeconds: null, startSeconds: null }
}

/** `HH:MM` ou `HH:MM:SS` — o Postgres devolve com segundos, o cadastro às vezes manda sem. */
function toDaySeconds(time: string): number {
  const [hours = '0', minutes = '0', seconds = '0'] = time.split(':')

  return Number(hours) * 3_600 + Number(minutes) * 60 + Number(seconds)
}
