/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readStopCityCode } from './stopAddressKey.service'
import type { HolidayWarning } from './trip.types'

/** O teto do corpo de `POST /business-calendar/day-checks` (spec 252 T4.2): acima dele a rota responde 400. */
export const DAY_CHECKS_MAX_ITEMS = 200

const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo'
/** O código do município (IBGE): sete dígitos, primeiro de 1 a 5 — a chave `cidade:<código>` nunca o satisfaz. */
const CITY_IBGE_CODE_PATTERN = /^[1-5][0-9]{6}$/u
/** `en-CA` escreve a data como `AAAA-MM-DD`, que é o formato civil da API. */
const civilDateFormatter = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: SAO_PAULO_TIME_ZONE,
  year: 'numeric',
})

export type DayCheckItem = Readonly<{ cityIbgeCode: string; date: string }>
export type DayCheckStop = Readonly<{ addressKey: string; estimatedArrivalAt: null | string }>
/** A parada ligada ao par que a representa: é por ele que o aviso volta para a parada certa. */
export type DayCheckTarget = DayCheckItem & Readonly<{ addressKey: string }>
export type DayChecksPlan = Readonly<{
  isTooLarge: boolean
  items: readonly DayCheckItem[]
  targets: readonly DayCheckTarget[]
}>

/** O dia civil da entrega é o de São Paulo (ADR-0100 §6); instante ilegível não vira data inventada. */
export function toSaoPauloCivilDate(instant: string): string | undefined {
  const date = new Date(instant)
  if (Number.isNaN(date.getTime())) return undefined
  return civilDateFormatter.format(date)
}

function toTarget(stop: DayCheckStop): DayCheckTarget | undefined {
  if (stop.estimatedArrivalAt === null) return undefined
  const cityIbgeCode = readStopCityCode(stop.addressKey)
  if (!CITY_IBGE_CODE_PATTERN.test(cityIbgeCode)) return undefined
  const date = toSaoPauloCivilDate(stop.estimatedArrivalAt)
  return date === undefined ? undefined : { addressKey: stop.addressKey, cityIbgeCode, date }
}

const NOTHING_TO_ASK: DayChecksPlan = { isTooLarge: false, items: [], targets: [] }

/**
 * O pedido único da montagem: um par por cidade e dia (a parada que repete o par não o repete no corpo), com a parada
 * ligada ao par. Mais de 200 pares distintos não cabem: o plano diz que é grande demais, e a tela fica no aviso
 * nacional de hoje — dizer "livre" para o dia que não foi perguntado seria afirmar o que ninguém conferiu.
 */
export function planDayChecks(stops: readonly DayCheckStop[]): DayChecksPlan {
  const targets: DayCheckTarget[] = []
  const seenStops = new Set<string>()
  for (const stop of stops) {
    if (seenStops.has(stop.addressKey)) continue
    const target = toTarget(stop)
    if (target === undefined) continue
    seenStops.add(stop.addressKey)
    targets.push(target)
  }
  const items = [
    ...new Map(
      targets.map(({ cityIbgeCode, date }) => [`${cityIbgeCode}:${date}`, { cityIbgeCode, date }]),
    ).values(),
  ]
  if (items.length > DAY_CHECKS_MAX_ITEMS) return { ...NOTHING_TO_ASK, isTooLarge: true }
  return { isTooLarge: false, items, targets }
}

/** O aviso que a rota devolveu volta para cada parada do par (cidade e dia); parada sem aviso não entra. */
export function matchDayCheckWarnings(
  input: Readonly<{ targets: readonly DayCheckTarget[]; warnings: readonly HolidayWarning[] }>,
): ReadonlyMap<string, readonly HolidayWarning[]> {
  const byPair = new Map<string, HolidayWarning>()
  for (const warning of input.warnings) {
    byPair.set(`${String(warning.cityIbgeCode)}:${warning.date}`, warning)
  }
  const byStop = new Map<string, readonly HolidayWarning[]>()
  for (const target of input.targets) {
    const warning = byPair.get(`${String(Number(target.cityIbgeCode))}:${target.date}`)
    if (warning !== undefined) byStop.set(target.addressKey, [warning])
  }
  return byStop
}
