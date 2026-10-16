/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import {
  navigateToDriverOccurrenceList,
  type DriverOccurrenceListFilter,
} from '@/modules/shared/driverRoute.service'

import type {
  RouteOccurrenceNoteGroup,
  RouteOccurrenceStopGroup,
  RouteOccurrenceStopLevelGroup,
} from '../shared/routeOccurrenceView.types'
import styles from '../styles/driverTrip.module.css'
import { DriverOccurrenceBadgeIcon } from './DriverOccurrenceBadgeIcon.component'

type OccurrenceGroupProps = Readonly<{
  count: number
  filter: DriverOccurrenceListFilter
  group: RouteOccurrenceStopLevelGroup
  kind: 'note' | 'stop'
  label: string
}>

function OccurrenceGroup({ count, filter, group, kind, label }: OccurrenceGroupProps) {
  const { t } = useTranslation('driverTrip')
  const filterKey =
    filter.documentId === undefined ? `stop:${filter.stopId ?? ''}` : `note:${filter.documentId}`
  return (
    <div className={styles.occurrenceGroup} data-group={kind}>
      <span className={styles.occurrenceGroupLabel}>
        {label}
        {count > 1 ? (
          <span className={styles.occurrenceGroupCount} data-note-count={count}>
            {count}
          </span>
        ) : null}
      </span>
      <div className={styles.occurrenceIcons}>
        {group.visible.map((entry) => (
          <DriverOccurrenceBadgeIcon entry={entry} key={entry.id} />
        ))}
        {group.moreCount > 0 ? (
          <button
            aria-label={t('routeOccurrence.more', { count: group.moreCount, label })}
            className={styles.occurrenceMoreButton}
            data-more-filter={filterKey}
            type="button"
            onClick={() => navigateToDriverOccurrenceList(filter)}
          >
            +{group.moreCount}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function NoteGroup({ group }: Readonly<{ group: RouteOccurrenceNoteGroup }>) {
  const { t } = useTranslation('driverTrip')
  return (
    <OccurrenceGroup
      count={group.entries.length}
      filter={{ documentId: group.documentId }}
      group={group}
      kind="note"
      label={t('routeOccurrence.noteLabel', { number: group.documentNumber ?? '' })}
    />
  )
}

type DriverOccurrenceStopRowProps = Readonly<{ group: RouteOccurrenceStopGroup }>

/** Spec 266 RF3: as ocorrências da parada agrupadas por nota, e as de parada (sem nota) no grupo delas. */
export function DriverOccurrenceStopRow({ group }: DriverOccurrenceStopRowProps) {
  const { t } = useTranslation('driverTrip')
  return (
    <div className={styles.occurrenceRow}>
      {group.noteGroups.map((noteGroup) => (
        <NoteGroup group={noteGroup} key={noteGroup.documentId} />
      ))}
      {group.stopLevel === undefined ? null : (
        <OccurrenceGroup
          count={group.stopLevel.entries.length}
          filter={{ stopId: group.stopId }}
          group={group.stopLevel}
          kind="stop"
          label={t('routeOccurrence.stopLevel')}
        />
      )}
    </div>
  )
}
