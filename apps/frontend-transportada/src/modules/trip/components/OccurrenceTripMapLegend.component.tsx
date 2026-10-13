/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import {
  OCCURRENCE_TRIP_MAP_STOP_ICON,
  OCCURRENCE_TRIP_MAP_WITHOUT_POSITION_ICON,
} from '../shared/occurrenceTripMap.constant'
import type {
  OccurrenceTripMapEntry,
  OccurrenceTripMapView,
} from '../shared/occurrenceTripMap.service'
import {
  TIMELINE_MAP_ICON_BY_CATEGORY,
  TIMELINE_MAP_LIST_COLLAPSE_THRESHOLD,
  type TimelineMapCategory,
} from '../shared/tripTimelineMap.constant'
import styles from '../styles/occurrenceTripMap.module.css'
import swatchStyles from '../styles/tripTimelineMiniMap.module.css'

type OccurrenceTripMapLegendProps = Readonly<{
  onFocus: (pinKey: string) => void
  view: OccurrenceTripMapView
}>

function swatchClass(category: TimelineMapCategory): string {
  return `${swatchStyles.swatch ?? ''} ${swatchStyles[category] ?? ''}`
}

function CategoryChips({ categories }: Readonly<{ categories: readonly TimelineMapCategory[] }>) {
  const { t } = useTranslation('trip')

  return (
    <ul aria-label={t('occurrenceTripMap.legend.types')} className={styles.chips}>
      {categories.map((category) => (
        <li className={styles.chip} key={category}>
          <span aria-hidden="true" className={swatchClass(category)}>
            <Icon name={TIMELINE_MAP_ICON_BY_CATEGORY[category]} />
          </span>
          {t(`eventTimeline.map.category.${category}`)}
        </li>
      ))}
    </ul>
  )
}

function entryTitle(entry: OccurrenceTripMapEntry, thisOccurrence: string): string {
  return entry.isThisOccurrence ? thisOccurrence : entry.label
}

function EntryItem({
  entry,
  onFocus,
}: Readonly<{ entry: OccurrenceTripMapEntry; onFocus: (pinKey: string) => void }>) {
  const { t } = useTranslation('trip')
  const title = entryTitle(entry, t('occurrenceTripMap.thisOccurrence'))
  const text =
    entry.order === null
      ? t('occurrenceTripMap.legend.entryWithoutPosition', { label: title, moment: entry.moment })
      : t('occurrenceTripMap.legend.entry', {
          label: title,
          moment: entry.moment,
          order: entry.order,
        })
  const textBlock = (
    <span className={styles.entryText}>
      <span>{text}</span>
      {entry.detail === null ? null : <span className={styles.entryDetail}>{entry.detail}</span>}
    </span>
  )
  const swatch = (
    <span aria-hidden="true" className={swatchClass(entry.category)}>
      <Icon name={entry.icon} />
    </span>
  )
  const thisClass = entry.isThisOccurrence ? styles.entryThis : undefined

  if (entry.pinKey === null) {
    return (
      <li className={`${styles.entryRow} ${styles.entryMuted} ${thisClass ?? ''}`}>
        <Icon name={OCCURRENCE_TRIP_MAP_WITHOUT_POSITION_ICON} />
        {swatch}
        {textBlock}
      </li>
    )
  }
  const { pinKey } = entry
  return (
    <li className={thisClass}>
      <Button
        aria-label={t('occurrenceTripMap.legend.focus', {
          entry: entry.detail === null ? text : `${text}. ${entry.detail}`,
        })}
        className={styles.entryButton}
        onClick={() => onFocus(pinKey)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <span aria-hidden="true" className={styles.orderMark}>
          {entry.order}
        </span>
        {swatch}
        {textBlock}
      </Button>
    </li>
  )
}

function EntryList({
  entries,
  onFocus,
}: Readonly<{ entries: readonly OccurrenceTripMapEntry[]; onFocus: (pinKey: string) => void }>) {
  const { t } = useTranslation('trip')

  return (
    <details open={entries.length <= TIMELINE_MAP_LIST_COLLAPSE_THRESHOLD}>
      <summary className={styles.summary}>
        {t('occurrenceTripMap.legend.listSummary', { count: entries.length })}
      </summary>
      <ol className={styles.entries}>
        {entries.map((entry) => (
          <EntryItem entry={entry} key={entry.id} onFocus={onFocus} />
        ))}
      </ol>
    </details>
  )
}

function NoteStopRow({
  noteStop,
  onFocus,
}: Readonly<{
  noteStop: NonNullable<OccurrenceTripMapView['noteStop']>
  onFocus: (pinKey: string) => void
}>) {
  const { t } = useTranslation('trip')
  const text = t('occurrenceTripMap.legend.noteStop', {
    label: noteStop.label,
    sequence: noteStop.sequence,
  })
  const { pinKey } = noteStop

  if (pinKey === null) {
    return (
      <div className={`${styles.entryRow} ${styles.entryMuted}`}>
        <Icon name={OCCURRENCE_TRIP_MAP_STOP_ICON} />
        <span className={styles.entryText}>
          <span>{text}</span>
          <span className={styles.entryDetail}>
            {t('occurrenceTripMap.legend.noteStopWithoutPoint')}
          </span>
        </span>
      </div>
    )
  }
  return (
    <Button
      aria-label={t('occurrenceTripMap.legend.noteStopFocus', {
        label: noteStop.label,
        sequence: noteStop.sequence,
      })}
      className={styles.entryButton}
      onClick={() => onFocus(pinKey)}
      size="sm"
      type="button"
      variant="ghost"
    >
      <Icon name={OCCURRENCE_TRIP_MAP_STOP_ICON} />
      <span className={styles.entryText}>{text}</span>
    </Button>
  )
}

/**
 * A legenda é ícone + palavra + cor por tipo (nunca só a cor), a linha de cada evento e a parada da
 * nota. Cada linha com pino é um botão de 44 px que centraliza o pino; o evento sem posição é nomeado
 * com o motivo, mas não tem o que centralizar.
 */
export function OccurrenceTripMapLegend({ onFocus, view }: OccurrenceTripMapLegendProps) {
  const { t } = useTranslation('trip')

  return (
    <div className={styles.stack}>
      {view.mode === 'events' && view.categories.length > 0 ? (
        <CategoryChips categories={view.categories} />
      ) : null}
      {view.noteStop === null ? null : <NoteStopRow noteStop={view.noteStop} onFocus={onFocus} />}
      {view.mode === 'stopsOnly' ? (
        <p className={styles.note}>
          {t('occurrenceTripMap.legend.stopsOnly', { count: view.stopCount })}
        </p>
      ) : null}
      {view.mode === 'events' && view.entries.length > 0 ? (
        <EntryList entries={view.entries} onFocus={onFocus} />
      ) : null}
    </div>
  )
}
