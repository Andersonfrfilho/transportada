/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { useMomentFormatter } from '@/modules/shared/useMomentFormatter.hook'

import {
  formatOccurrenceItemQuantity,
  formatOccurrenceQuantity,
  resolveOccurrenceCorrectionHistory,
} from '../shared/tripOccurrenceDetail.service'
import type { TripOccurrenceDetail } from '../shared/tripOccurrenceFeed.service'
import styles from '../styles/trip.module.css'

export type OccurrenceCorrectionHistoryProps = Readonly<{
  occurrence: TripOccurrenceDetail
}>

/** Spec 235 RF5/P3: cada correção com autor, hora e o conjunto que passou a valer; sem correção, nada. */
export function OccurrenceCorrectionHistory({ occurrence }: OccurrenceCorrectionHistoryProps) {
  const { t } = useTranslation('trip')
  const titleId = useId()
  const formatMoment = useMomentFormatter()
  const history = resolveOccurrenceCorrectionHistory(occurrence.corrections ?? [], occurrence.items)
  if (history.length === 0) return null

  return (
    <section aria-labelledby={titleId} className={styles.occurrenceCorrectionHistory}>
      <h3 className={styles.occurrenceItemsTitle} id={titleId}>
        {t('occurrenceDetail.corrections.title')}
      </h3>
      <ol className={styles.occurrenceCorrectionList}>
        {history.map((entry) => (
          <li key={entry.correctedAt}>
            <p>
              {t('occurrenceDetail.corrections.entry', {
                moment: formatMoment(entry.correctedAt),
                name: entry.correctedByName,
              })}
            </p>
            <p className={styles.hint}>
              {t('occurrenceDetail.corrections.nowValid')}{' '}
              {entry.items
                .map((item) => {
                  const quantity = formatOccurrenceItemQuantity(item, formatOccurrenceQuantity)
                  return quantity === '' ? item.code : `${item.code} · ${quantity}`
                })
                .join(', ')}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}
