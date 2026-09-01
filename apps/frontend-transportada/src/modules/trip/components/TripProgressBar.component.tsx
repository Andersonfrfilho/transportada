/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { TRIP_DOCUMENT_SEPARATION_STATUS, type TripDocumentDetail } from '../shared/trip.types'
import { computeTripStopProgress } from '../shared/tripStopProgress.service'
import styles from '../styles/trip.module.css'

const SEGMENT_CLASS_BY_STATUS: Readonly<Record<string, string>> = {
  delivered: styles.progressSegmentDelivered ?? '',
  loaded: styles.progressSegmentLoaded ?? '',
  pending: styles.progressSegmentPending ?? '',
  returned: styles.progressSegmentReturned ?? '',
  separated: styles.progressSegmentSeparated ?? '',
}

type TripProgressBarProps = Readonly<{ documents: readonly TripDocumentDetail[] }>

/** RF-9 (spec 056): a barra de progresso por fase — nenhum cálculo além de contar cada nota uma
 * vez em `separationStatus`, já feito por `computeTripStopProgress`. */
export function TripProgressBar({ documents }: TripProgressBarProps) {
  const { t } = useTranslation('trip')
  const progress = computeTripStopProgress(documents)

  if (progress.total === 0) return null

  return (
    <div className={styles.progressWrapper}>
      <div
        aria-label={t('stops.progressLabel')}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(progress.percentByStatus.delivered ?? 0)}
        className={styles.progressTrack}
        role="progressbar"
      >
        {TRIP_DOCUMENT_SEPARATION_STATUS.map((status) => {
          const percent = progress.percentByStatus[status] ?? 0
          if (percent === 0) return null
          return (
            <span
              className={SEGMENT_CLASS_BY_STATUS[status]}
              key={status}
              style={{ width: `${percent}%` }}
              title={t(`separationStatus.${status}`)}
            />
          )
        })}
      </div>
      <ul className={styles.progressLegend}>
        {TRIP_DOCUMENT_SEPARATION_STATUS.map((status) => (
          <li className={styles.progressLegendItem} key={status}>
            <span className={SEGMENT_CLASS_BY_STATUS[status]} />
            {t(`separationStatus.${status}`)} ({Math.round(progress.percentByStatus[status] ?? 0)}%)
          </li>
        ))}
      </ul>
    </div>
  )
}
