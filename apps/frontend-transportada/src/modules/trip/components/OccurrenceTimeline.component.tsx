/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { Tabs } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

import { useTripOccurrenceTimelineQuery } from '../queries/tripOccurrenceFeed.query'
import {
  describeOccurrenceTimelineEvent,
  filterOccurrenceTimelineEvents,
  formatOccurrenceElapsed,
  formatOccurrenceGap,
  OCCURRENCE_TIMELINE_ACTOR_TONE,
  OCCURRENCE_TIMELINE_FILTERS,
  resolveOccurrenceTimelineDurations,
  type OccurrenceTimelineDuration,
  type OccurrenceTimelineEvent,
  type OccurrenceTimelineFilter,
  type OccurrenceTimelineTone,
} from '../shared/tripOccurrenceTimeline.service'
import styles from '../styles/trip.module.css'
import { formatMoment } from './TripOccurrenceTable.component'

/** Os tempos do topo contam em minutos: um tique por minuto basta, e não acorda a tela à toa. */
const CLOCK_TICK_MS = 60_000
const SKELETON_ROWS = 3

const TONE_CLASS: Readonly<Record<OccurrenceTimelineTone, string | undefined>> = {
  contractor: styles.occurrenceTimelineContractor,
  driver: styles.occurrenceTimelineDriver,
  out: styles.occurrenceTimelineOut,
  system: styles.occurrenceTimelineSystem,
}

function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date())
    }, CLOCK_TICK_MS)
    return () => {
      clearInterval(interval)
    }
  }, [])
  return now
}

function TimingValue({
  duration,
  empty,
}: Readonly<{ duration: null | OccurrenceTimelineDuration; empty: string }>) {
  const { t } = useTranslation('trip')
  if (duration === null) return <dd className={styles.occurrenceTimingEmpty}>{empty}</dd>
  return (
    <dd>
      <span className={styles.occurrenceTimingValue}>
        {formatOccurrenceElapsed(duration.seconds)}
      </span>
      {duration.running ? (
        <span className={styles.occurrenceTimingRunning}>{t('occurrenceTimeline.running')}</span>
      ) : null}
    </dd>
  )
}

function TimelineItem({ event }: Readonly<{ event: OccurrenceTimelineEvent }>) {
  const { t } = useTranslation('trip')
  const sentence = describeOccurrenceTimelineEvent(event)
  /** O status da tratativa chega como chave de locale (a da coluna da listagem): traduz aqui. */
  const values =
    typeof sentence.values.status === 'string'
      ? { ...sentence.values, status: t(sentence.values.status) }
      : sentence.values
  const actor = event.actor.name ?? t(`occurrenceTimeline.actor.${event.actor.kind}`)
  const gap = formatOccurrenceGap(event.sincePreviousSeconds)

  return (
    <li
      className={cn(
        styles.occurrenceTimelineItem,
        TONE_CLASS[OCCURRENCE_TIMELINE_ACTOR_TONE[event.actor.kind]],
        event.isKey ? styles.occurrenceTimelineKey : undefined,
      )}
    >
      {gap === null ? null : (
        <p className={styles.occurrenceTimelineGap}>
          {t('occurrenceTimeline.gap', { elapsed: gap })}
        </p>
      )}
      <div className={styles.occurrenceTimelineCard}>
        <p className={styles.occurrenceTimelineHead}>
          <span className={styles.occurrenceTimelineActor}>{actor}</span>
          <time className={styles.occurrenceTimelineTime} dateTime={event.occurredAt}>
            {formatMoment(event.occurredAt)}
          </time>
        </p>
        <p className={styles.occurrenceTimelineTitle}>
          {event.isKey ? (
            <span className={styles.occurrenceTimelineKeyMark}>{t('occurrenceTimeline.key')}</span>
          ) : null}
          {t(sentence.key, values)}
        </p>
        {event.kind === 'case.transition' && event.note.trim() !== '' ? (
          <p className={styles.occurrenceTimelineNote}>{event.note}</p>
        ) : null}
      </div>
    </li>
  )
}

function TimelineList({ events }: Readonly<{ events: readonly OccurrenceTimelineEvent[] }>) {
  const { t } = useTranslation('trip')
  if (events.length === 0) return <p className={styles.hint}>{t('occurrenceTimeline.empty')}</p>
  return (
    <ol className={styles.occurrenceTimelineList}>
      {events.map((event) => (
        <TimelineItem event={event} key={event.id} />
      ))}
    </ol>
  )
}

/**
 * Spec 183 RF19: a linha do tempo da ocorrência — os três tempos no topo, o filtro por participante
 * e os eventos com a cor do ator (as dos balões, T704). **Leitura pura** (D4).
 */
export function OccurrenceTimelinePanel({
  companyId,
  occurrenceId,
}: Readonly<{ companyId?: string; occurrenceId: string }>) {
  const { t } = useTranslation('trip')
  const [filter, setFilter] = useState<OccurrenceTimelineFilter>('all')
  const now = useMinuteClock()
  const query = useTripOccurrenceTimelineQuery({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: true,
    occurrenceId,
  })
  const timeline = query.data

  return (
    <section aria-labelledby="occurrence-timeline-title" className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 id="occurrence-timeline-title">{t('occurrenceTimeline.title')}</h2>
      </div>
      {query.isLoading ? (
        <SkeletonGroup label={t('occurrenceTimeline.loading')}>
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <Skeleton height="3.5rem" key={index} width="100%" />
          ))}
        </SkeletonGroup>
      ) : null}
      {query.isError ? (
        <p className={styles.hint} role="alert">
          {t('occurrenceTimeline.error')}
        </p>
      ) : null}
      {timeline === undefined ? null : (
        <>
          <OccurrenceTimings now={now} timings={timeline.timings} />
          <Tabs
            ariaLabel={t('occurrenceTimeline.filterLabel')}
            items={OCCURRENCE_TIMELINE_FILTERS.map((option) => ({
              badge: String(filterOccurrenceTimelineEvents(timeline.events, option).length),
              id: option,
              label: t(`occurrenceTimeline.filter.${option}`),
              panel: (
                <TimelineList events={filterOccurrenceTimelineEvents(timeline.events, option)} />
              ),
            }))}
            onChange={(id) => {
              const next = OCCURRENCE_TIMELINE_FILTERS.find((option) => option === id)
              if (next !== undefined) setFilter(next)
            }}
            value={filter}
          />
        </>
      )}
    </section>
  )
}

function OccurrenceTimings({
  now,
  timings,
}: Readonly<{ now: Date; timings: Parameters<typeof resolveOccurrenceTimelineDurations>[0] }>) {
  const { t } = useTranslation('trip')
  const durations = resolveOccurrenceTimelineDurations(timings, now)

  return (
    <dl className={styles.occurrenceTimings}>
      <div>
        <dt>{t('occurrenceTimeline.timing.open')}</dt>
        <TimingValue duration={durations.open} empty={t('occurrenceTimeline.timing.none')} />
      </div>
      <div>
        <dt>{t('occurrenceTimeline.timing.contractorResponse')}</dt>
        <TimingValue
          duration={durations.contractorResponse}
          empty={t('occurrenceTimeline.timing.notAsked')}
        />
      </div>
      <div>
        <dt>{t('occurrenceTimeline.timing.driverRelease')}</dt>
        <TimingValue
          duration={durations.driverRelease}
          empty={t('occurrenceTimeline.timing.none')}
        />
      </div>
    </dl>
  )
}
