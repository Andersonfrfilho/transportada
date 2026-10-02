/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { IconName } from '@/components/ui/icon'
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import { resolveTripTimelineTone } from './tripTimeline.service'
import {
  TRIP_DOCUMENT_SEPARATION_STATUS,
  TRIP_STATUS,
  type TripTimelineItem,
  type TripTimelineKind,
} from './trip.types'

/** Intervalo a partir do qual a linha do tempo desenha a régua "sem registro". */
export const TRIP_TIMELINE_GAP_THRESHOLD_MINUTES = 120

const MILLISECONDS_PER_MINUTE = 60_000
const MINUTES_PER_HOUR = 60

const KNOWN_TRIP_STATUSES: ReadonlySet<string> = new Set(TRIP_STATUS)
const KNOWN_DOCUMENT_STATUSES: ReadonlySet<string> = new Set(TRIP_DOCUMENT_SEPARATION_STATUS)

const ICON_BY_KIND = {
  'document.canhoto_photo': 'camera',
  'document.delivered': 'check',
  'document.occurrence': 'alert',
  'document.returned': 'refresh',
  'document.status_changed': 'document',
  'stop.address_corrected': 'edit',
  'stop.arrived': 'map-pin',
  'stop.departed': 'truck',
  'stop.departure_cancelled': 'close',
  'stop.occurrence': 'alert',
  'trip.created': 'add',
  'trip.dispatched': 'send',
  'trip.status_changed': 'clock',
} as const satisfies Record<TripTimelineKind, IconName>

const NEUTRAL_KINDS: ReadonlySet<TripTimelineKind> = new Set([
  'document.canhoto_photo',
  'stop.address_corrected',
  'stop.arrived',
  'stop.departed',
  'trip.created',
  'trip.dispatched',
])

export type TripTimelineIconTone = 'done' | 'neutral' | 'problem' | 'progress'

export function resolveTripTimelineIcon(
  item: TripTimelineItem,
): Readonly<{ icon: IconName; tone: TripTimelineIconTone }> {
  return {
    icon: ICON_BY_KIND[item.kind],
    tone: NEUTRAL_KINDS.has(item.kind) ? 'neutral' : resolveTripTimelineTone(item),
  }
}

export type TripTimelineChip = Readonly<{
  id: 'late' | 'stop' | 'transition'
  label: string
  tone: 'copper' | 'neutral'
}>

function minutesBetween({ from, to }: Readonly<{ from: string; to: string }>): number | null {
  const difference = Date.parse(to) - Date.parse(from)
  if (Number.isNaN(difference) || difference < 0) return null
  return Math.round(difference / MILLISECONDS_PER_MINUTE)
}

export function formatTripTimelineDuration(minutes: number, t: Translate): string {
  if (minutes < MINUTES_PER_HOUR) return t('eventTimeline.duration.minutes', { count: minutes })
  const hours = Math.floor(minutes / MINUTES_PER_HOUR)
  const remainder = minutes % MINUTES_PER_HOUR
  if (remainder === 0) return t('eventTimeline.duration.hours', { hours })
  return t('eventTimeline.duration.hoursMinutes', { hours, minutes: remainder })
}

function resolveTransitionChip(item: TripTimelineItem, t: Translate): TripTimelineChip | null {
  if (item.fromStatus === null || item.toStatus === null) return null
  const isTrip = item.kind === 'trip.status_changed'
  if (!isTrip && item.kind !== 'document.status_changed') return null
  const known = isTrip ? KNOWN_TRIP_STATUSES : KNOWN_DOCUMENT_STATUSES
  if (!known.has(item.fromStatus) || !known.has(item.toStatus)) return null
  const dictionary = isTrip ? 'status' : 'separationStatus'
  return {
    id: 'transition',
    label: t('eventTimeline.chip.transition', {
      from: t(`${dictionary}.${item.fromStatus}`),
      to: t(`${dictionary}.${item.toStatus}`),
    }),
    tone: 'neutral',
  }
}

function resolveLateChip(item: TripTimelineItem, t: Translate): TripTimelineChip | null {
  const minutes =
    item.recordedAt === null ? null : minutesBetween({ from: item.occurredAt, to: item.recordedAt })
  if (minutes !== null && minutes > 0) {
    return {
      id: 'late',
      label: t('eventTimeline.chip.recordedLater', {
        duration: formatTripTimelineDuration(minutes, t),
      }),
      tone: 'copper',
    }
  }
  if (item.lateRegistration !== true) return null
  return { id: 'late', label: t('eventTimeline.chip.recordedLaterUnknown'), tone: 'copper' }
}

/** Só o que o item já publica: chip sem dado correspondente não é desenhado. */
export function resolveTripTimelineChips(
  item: TripTimelineItem,
  t: Translate,
): readonly TripTimelineChip[] {
  const stopChip: TripTimelineChip | null =
    item.stop === null
      ? null
      : {
          id: 'stop',
          label: t('eventTimeline.chip.stop', { sequence: item.stop.sequence }),
          tone: 'neutral',
        }
  return [stopChip, resolveTransitionChip(item, t), resolveLateChip(item, t)].filter(
    (chip): chip is TripTimelineChip => chip !== null,
  )
}

export type TripTimelineInterval =
  | Readonly<{ kind: 'after' | 'gap'; minutes: number }>
  | Readonly<{ kind: 'none' }>

/** `newer` e `older` na ordem da API (do mais recente para o mais antigo). */
export function resolveTripTimelineInterval({
  newer,
  older,
}: Readonly<{ newer: TripTimelineItem; older: TripTimelineItem }>): TripTimelineInterval {
  const minutes = minutesBetween({ from: older.occurredAt, to: newer.occurredAt })
  if (minutes === null || minutes < 1) return { kind: 'none' }
  return { kind: minutes >= TRIP_TIMELINE_GAP_THRESHOLD_MINUTES ? 'gap' : 'after', minutes }
}
