/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.2 (ADR-0100 §6): o aviso de feriado das paradas do detalhe da viagem. A data é o dia civil de São
 * Paulo da ETA da parada (a viagem não tem data planejada própria), a cidade é o 1º segmento do `address_key`
 * (o destino físico, que o desvio manual move junto) e o nome da cidade sai do endereço da nota — só
 * quando o código dele é o da parada. Parada concluída ou sem ETA não avisa. Os calendários que o prazo
 * já carregou são reaproveitados; senão, as quatro leituras de sempre, uma vez só, em série.
 */
import {
  resolveToday,
  toCivilDate,
} from '../../business-calendar/application/civil-date.service.js'
import type { HolidayWarningItem } from '../../business-calendar/application/holiday-warning.port.js'
import {
  BUSINESS_CALENDAR_TIME_ZONE,
  CITY_IBGE_CODE_PATTERN,
} from '../../business-calendar/domain/business-calendar.constant.js'
import type { BusinessCalendar } from '../../business-calendar/domain/business-calendar.types.js'
import type { HolidayWarning } from '../../business-calendar/domain/holiday-warning.policy.js'
import { readHolidayWarnings } from '../../business-calendar/infrastructure/holiday-warning.reader.js'
import { safeLogWarn } from '../../logging/safe-logger.service.js'
import type { ApiLogger } from '../../shared/api.types.js'
import { normalizeCityCode, readStopCityCode } from '../domain/stop-address-key.js'
import { shouldWarnRefusal } from './trip-delivery-deadline-warn-throttle.support.js'
import type { TripQueryable } from './trip-queryable.type.js'

const TRIP_HOLIDAY_WARNING_UNAVAILABLE_MESSAGE = 'trip_holiday_warning_unavailable'
const REFUSAL_THROTTLE_PREFIX = 'holiday-warning:'

type WarnableStop = {
  readonly addressKey: string
  readonly completedAt: Date | null
  readonly estimatedArrivalAt: Date | null
  readonly id: string
}

type StopAddress = {
  readonly city: string
  readonly components: { readonly cityCode: string | null }
}

export type ReadTripStopHolidayWarningsParams = {
  readonly addressOf: (stopId: string) => StopAddress | undefined
  /** Os calendários que a leitura do prazo montou; o que cobrir os anos das ETAs não é lido de novo. */
  readonly calendars: ReadonlyMap<string, BusinessCalendar>
  readonly companyId: string
  readonly logger?: ApiLogger
  readonly now: Date
  readonly stops: readonly WarnableStop[]
  readonly tripId: string
}

/** O nome só vale quando o endereço da nota é o da cidade da parada: com desvio manual os dois diferem. */
function resolveCityName(address: StopAddress | undefined, cityCode: string): string | undefined {
  if (address === undefined || address.city === '') return undefined
  return normalizeCityCode(address.components.cityCode) === cityCode ? address.city : undefined
}

function toItems(params: ReadTripStopHolidayWarningsParams): readonly HolidayWarningItem[] {
  return params.stops.flatMap((stop) => {
    if (stop.completedAt !== null || stop.estimatedArrivalAt === null) return []
    const cityCode = readStopCityCode(stop.addressKey)
    if (!CITY_IBGE_CODE_PATTERN.test(cityCode)) return []

    const cityName = resolveCityName(params.addressOf(stop.id), cityCode)
    return [
      {
        cityIbgeCode: cityCode,
        ...(cityName === undefined ? {} : { cityName }),
        date: toCivilDate({
          instant: stop.estimatedArrivalAt,
          timeZone: BUSINESS_CALENDAR_TIME_ZONE,
        }),
        key: stop.id,
      },
    ]
  })
}

/** Só ids e o código da recusa: nada de dado da nota nem do destinatário no log. */
function warnRefusals(
  params: ReadTripStopHolidayWarningsParams,
  refusals: ReadonlyMap<string, string>,
): void {
  const { logger } = params
  if (logger === undefined) return
  for (const code of new Set(refusals.values())) {
    const throttleKey = `${REFUSAL_THROTTLE_PREFIX}${code}`
    if (!shouldWarnRefusal({ code: throttleKey, now: params.now, tripId: params.tripId })) continue
    safeLogWarn({
      logger,
      message: TRIP_HOLIDAY_WARNING_UNAVAILABLE_MESSAGE,
      metadata: {
        cityIbgeCodes: [...refusals]
          .filter(([, refused]) => refused === code)
          .map(([city]) => city),
        code,
        companyId: params.companyId,
        tripId: params.tripId,
      },
    })
  }
}

/** O aviso de cada parada pelo id dela; calendário recusado tira o aviso da cidade, nunca derruba o detalhe. */
export async function readTripStopHolidayWarnings(
  queryable: TripQueryable,
  params: ReadTripStopHolidayWarningsParams,
): Promise<ReadonlyMap<string, HolidayWarning>> {
  const items = toItems(params)
  if (items.length === 0) return new Map()

  const { refusals, warnings } = await readHolidayWarnings(queryable, {
    companyId: params.companyId,
    items,
    knownCalendars: params.calendars,
    referenceYear: Number(resolveToday({ now: params.now }).slice(0, 4)),
  })
  warnRefusals(params, refusals)
  return warnings
}
