/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.3 (ADR-0100 D12): o aviso de feriado nas paradas da leitura do motorista. Chamado pelo caso de
 * uso, depois do recorte pelo vínculo do motorista — nunca pelo repositório da leitura. Só parada NÃO
 * concluída, com ETA; a data é o dia civil de São Paulo da ETA, ou HOJE com a parada em andamento. Custo
 * fixo: uma consulta de contexto e uma carga de calendário (4 consultas) para todas as paradas e cidades.
 * Falha aqui só tira o aviso: a leitura do motorista é o caminho crítico e não pode cair por um refinamento.
 */
import type {
  HolidayWarningItem,
  HolidayWarningsResult,
} from '../../business-calendar/application/holiday-warning.port.js'
import {
  resolveToday,
  toCivilDate,
} from '../../business-calendar/application/civil-date.service.js'
import {
  BUSINESS_CALENDAR_TIME_ZONE,
  CITY_IBGE_CODE_PATTERN,
} from '../../business-calendar/domain/business-calendar.constant.js'
import { safeLogWarn } from '../../logging/safe-logger.service.js'
import { normalizeCityCode, readStopCityCode } from '../domain/stop-address-key.js'
import type {
  DriverHolidayWarningsDependency,
  DriverStopHolidayContext,
} from './driver-stop-holiday-warning.port.js'
import type { DriverTrip, DriverTripStop } from './find-current-driver-trip.use-case.js'

const DRIVER_HOLIDAY_WARNING_UNAVAILABLE_MESSAGE = 'driver_holiday_warning_unavailable'

export type AttachDriverStopHolidayWarningsParams = {
  readonly companyId: string
  readonly dependency?: DriverHolidayWarningsDependency
  readonly now: Date
  readonly trips: readonly DriverTrip[]
}

type OpenStops = ReadonlyMap<string, { readonly stop: DriverTripStop; readonly tripId: string }>

function collectOpenStops(trips: readonly DriverTrip[]): OpenStops {
  const open = new Map<string, { readonly stop: DriverTripStop; readonly tripId: string }>()
  for (const trip of trips) {
    for (const stop of trip.stops) {
      if (stop.completedAt === null) open.set(stop.id, { stop, tripId: trip.id })
    }
  }
  return open
}

/** Em andamento: já chegou nela, ou já tocou em "Iniciar rota" para ela. */
function isInProgress(stop: DriverTripStop): boolean {
  return stop.arrivedAt !== null || stop.enRouteSince !== null
}

/** O nome só vale quando o endereço da nota é o da cidade da parada: com desvio manual os dois diferem. */
function resolveCityName(context: DriverStopHolidayContext, cityCode: string): string | undefined {
  const { address } = context
  if (address === undefined || address.city === '') return undefined
  return normalizeCityCode(address.cityCode) === cityCode ? address.city : undefined
}

function toWarningItem(params: {
  readonly context: DriverStopHolidayContext
  readonly now: Date
  readonly stop: DriverTripStop
}): HolidayWarningItem | undefined {
  const { context, now, stop } = params
  const cityCode = readStopCityCode(context.addressKey)
  if (!CITY_IBGE_CODE_PATTERN.test(cityCode)) return undefined

  const cityName = resolveCityName(context, cityCode)
  return {
    cityIbgeCode: cityCode,
    ...(cityName === undefined ? {} : { cityName }),
    date: isInProgress(stop)
      ? resolveToday({ now })
      : toCivilDate({ instant: context.estimatedArrivalAt, timeZone: BUSINESS_CALENDAR_TIME_ZONE }),
    key: stop.id,
  }
}

function toWarningItems(params: {
  readonly contexts: readonly DriverStopHolidayContext[]
  readonly now: Date
  readonly open: OpenStops
}): readonly HolidayWarningItem[] {
  const contextByStop = new Map(params.contexts.map((context) => [context.stopId, context]))
  return [...params.open.values()].flatMap(({ stop }) => {
    const context = contextByStop.get(stop.id)
    if (context === undefined) return []
    const item = toWarningItem({ context, now: params.now, stop })
    return item === undefined ? [] : [item]
  })
}

/** Só ids e contagem: nada de nome de cidade, de destinatário nem a mensagem do erro. */
function warnUnavailable(params: {
  readonly code?: string
  readonly companyId: string
  readonly dependency: DriverHolidayWarningsDependency
  readonly stopIds: readonly string[]
  readonly open: OpenStops
}): void {
  const { logger } = params.dependency
  if (logger === undefined) return
  const tripIds = new Set(params.stopIds.map((stopId) => params.open.get(stopId)?.tripId ?? ''))
  safeLogWarn({
    logger,
    message: DRIVER_HOLIDAY_WARNING_UNAVAILABLE_MESSAGE,
    metadata: {
      affectedStopCount: params.stopIds.length,
      ...(params.code === undefined ? {} : { code: params.code }),
      companyId: params.companyId,
      tripIds: [...tripIds],
    },
  })
}

function warnRefusals(params: {
  readonly companyId: string
  readonly dependency: DriverHolidayWarningsDependency
  readonly items: readonly HolidayWarningItem[]
  readonly open: OpenStops
  readonly result: HolidayWarningsResult
}): void {
  for (const code of new Set(params.result.refusals.values())) {
    const stopIds = params.items
      .filter((item) => params.result.refusals.get(item.cityIbgeCode) === code)
      .map((item) => item.key)
    warnUnavailable({ ...params, code, stopIds })
  }
}

function applyWarnings(
  trips: readonly DriverTrip[],
  warnings: HolidayWarningsResult['warnings'],
): readonly DriverTrip[] {
  return trips.map((trip) => ({
    ...trip,
    stops: trip.stops.map((stop) => {
      const warning = warnings.get(stop.id)
      return warning === undefined ? stop : { ...stop, holidayWarnings: [warning] }
    }),
  }))
}

/** As viagens do motorista com `holidayWarnings` nas paradas que fecham por feriado; as outras, como vieram. */
export async function attachDriverStopHolidayWarnings(
  params: AttachDriverStopHolidayWarningsParams,
): Promise<readonly DriverTrip[]> {
  const { companyId, dependency, now, trips } = params
  if (dependency === undefined) return trips
  const open = collectOpenStops(trips)
  if (open.size === 0) return trips

  const stopIds = [...open.keys()]
  try {
    const contexts = await dependency.contexts.list({ companyId, stopIds })
    const items = toWarningItems({ contexts, now, open })
    if (items.length === 0) return trips

    const result = await dependency.calendar.read({ companyId, items })
    warnRefusals({ companyId, dependency, items, open, result })
    return applyWarnings(trips, result.warnings)
  } catch {
    warnUnavailable({ companyId, dependency, open, stopIds })
    return trips
  }
}
