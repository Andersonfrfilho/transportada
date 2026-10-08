/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.2c: o prazo de entrega de cada nota do detalhe da viagem. A chegada e o prazo copiado vêm
 * do join das notas (nenhuma consulta nova); aqui entram, e só se alguma nota tem chegada e prazo, o
 * desvio manual, a entrega e o calendário — seis consultas por viagem, em série, seja uma nota ou
 * duzentas. Só informa: nota sem prazo é `null`, e o detalhe nunca cai por causa de um selo.
 */
import { BusinessCalendarError } from '../../business-calendar/domain/business-calendar.error.js'
import { safeLogWarn } from '../../logging/safe-logger.service.js'
import { resolveDeliveryDeadlineFromInstants } from '../application/delivery-deadline-input.service.js'
import { resolveDeadlineCoverage } from '../domain/delivery-deadline-coverage.policy.js'
import {
  DELIVERY_DEADLINE_STATE,
  DELIVERY_OUTCOME_KIND,
} from '../domain/delivery-deadline.constant.js'
import type { DeliveryDeadlineView } from '../domain/delivery-deadline.types.js'
import { loadCityCalendars, type CityCalendar } from './trip-delivery-deadline-calendar.support.js'
import {
  civilYearOf,
  isCandidate,
  locateCandidates,
  toInstantOutcome,
} from './trip-delivery-deadline-locate.support.js'
import {
  loadDeliveredMoments,
  loadDeliveryAddressOverrideCities,
} from './trip-delivery-deadline.query.js'
import { TRIP_DELIVERY_DEADLINE_UNAVAILABLE_MESSAGE } from './trip-delivery-deadline.constant.js'
import { shouldWarnRefusal } from './trip-delivery-deadline-warn-throttle.support.js'
import type {
  LocatedCandidate,
  ReadTripDeliveryDeadlinesParams,
} from './trip-delivery-deadline.types.js'
import type { TripQueryable } from './trip-queryable.type.js'

export type {
  DeliveryDeadlineNote,
  DeliveryDeadlineReadContext,
  ReadTripDeliveryDeadlinesParams,
} from './trip-delivery-deadline.types.js'

type Refusals = Map<string, string[]>

function recordRefusal(refusals: Refusals, input: { code: string; tripDocumentId: string }): void {
  const ids = refusals.get(input.code)
  if (ids === undefined) refusals.set(input.code, [input.tripDocumentId])
  else ids.push(input.tripDocumentId)
}

/** Só ids e o código da recusa: nada de dado da nota nem do destinatário no log. */
function warnRefusals(params: ReadTripDeliveryDeadlinesParams, refusals: Refusals): void {
  const { clock, logger } = params.context
  if (logger === undefined) return
  for (const [code, tripDocumentIds] of refusals) {
    if (!shouldWarnRefusal({ code, now: clock.now(), tripId: params.tripId })) continue
    safeLogWarn({
      logger,
      message: TRIP_DELIVERY_DEADLINE_UNAVAILABLE_MESSAGE,
      metadata: { code, companyId: params.companyId, tripDocumentIds, tripId: params.tripId },
    })
  }
}

async function locateNotes(
  queryable: TripQueryable,
  params: ReadTripDeliveryDeadlinesParams,
): Promise<readonly LocatedCandidate[]> {
  const candidates = params.notes.filter(isCandidate)
  if (candidates.length === 0) return []

  const ids = {
    companyId: params.companyId,
    tripDocumentIds: candidates.map((candidate) => candidate.tripDocumentId),
  }
  const overrides = await loadDeliveryAddressOverrideCities(queryable, ids)
  const deliveredMoments = await loadDeliveredMoments(queryable, ids)
  return locateCandidates({
    candidates,
    deliveredMoments,
    overrides,
    stopAddresses: params.stopAddresses,
  })
}

type ResolveEntryParams = {
  readonly cityCalendars: ReadonlyMap<string, CityCalendar>
  readonly entry: LocatedCandidate
  readonly now: Date
  readonly refusals: Refusals
}

function resolveEntry(input: ResolveEntryParams): DeliveryDeadlineView | undefined {
  const { cityCalendars, entry, now, refusals } = input
  const { tripDocumentId } = entry.note
  const city = cityCalendars.get(entry.cityIbgeCode)
  const outcome = toInstantOutcome(entry)
  if (city === undefined || outcome === undefined) return undefined
  if ('refusalCode' in city) {
    recordRefusal(refusals, { code: city.refusalCode, tripDocumentId })
    return undefined
  }

  try {
    const result = resolveDeliveryDeadlineFromInstants({
      arrivedAt: entry.note.arrivedAt,
      calendar: city.calendar,
      deadlineBusinessDays: entry.note.deadlineBusinessDays,
      now,
      outcome,
    })
    return result.state === DELIVERY_DEADLINE_STATE.NOT_APPLICABLE ? undefined : result
  } catch (error) {
    if (!(error instanceof BusinessCalendarError)) throw error
    recordRefusal(refusals, { code: error.code, tripDocumentId })
    return undefined
  }
}

function resolveCoverage(located: readonly LocatedCandidate[], now: Date) {
  const hasPendingNote = located.some(
    (entry) => entry.note.outcomeKind === DELIVERY_OUTCOME_KIND.PENDING,
  )
  return resolveDeadlineCoverage({
    arrivalYears: located.map(({ note }) => civilYearOf(note.arrivedAt)),
    deliveryYears: located.flatMap((entry) =>
      entry.deliveredAt === null ? [] : [civilYearOf(entry.deliveredAt)],
    ),
    todayYear: hasPendingNote ? civilYearOf(now) : null,
  })
}

export async function readTripDeliveryDeadlines(
  queryable: TripQueryable,
  params: ReadTripDeliveryDeadlinesParams,
): Promise<ReadonlyMap<string, DeliveryDeadlineView>> {
  const located = await locateNotes(queryable, params)
  if (located.length === 0) return new Map()

  const now = params.context.clock.now()
  const cityCalendars = await loadCityCalendars(queryable, {
    cityCodes: [...new Set(located.map((entry) => entry.cityIbgeCode))],
    companyId: params.companyId,
    coverage: resolveCoverage(located, now),
  })
  const views = new Map<string, DeliveryDeadlineView>()
  const refusals: Refusals = new Map()
  for (const entry of located) {
    const view = resolveEntry({ cityCalendars, entry, now, refusals })
    if (view !== undefined) views.set(entry.note.tripDocumentId, view)
  }
  warnRefusals(params, refusals)
  return views
}
