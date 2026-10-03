/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import { useMomentFormatter } from '@/modules/shared/useMomentFormatter.hook'
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import { resolveOccurrenceCancellationMark } from '../shared/occurrenceCancellation.service'
import type { OccurrenceCancellation } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

export type OccurrenceCancellationMarkProps = Readonly<{
  cancellation: null | OccurrenceCancellation | undefined
  /** `badge` cabe numa célula ou cartão; `notice` traz autor, hora e motivo à vista. */
  variant: 'badge' | 'notice'
}>

/** Spec 240 RF6: a marca de cancelada é texto — a cor só reforça; a ocorrência nunca some. */
export function OccurrenceCancellationMark({
  cancellation,
  variant,
}: OccurrenceCancellationMarkProps) {
  const { t } = useTranslation('trip')
  const formatMoment = useMomentFormatter()
  const mark = resolveOccurrenceCancellationMark(cancellation, {
    formatMoment,
    translate: t as Translate,
  })
  if (mark === null) return null

  if (variant === 'badge') {
    return (
      <>
        <span className={cn(styles.statusBadge, styles.occurrenceCancelledBadge)}>
          {mark.label}
        </span>
        <span className={styles.srOnly}>{mark.summary}</span>
      </>
    )
  }
  return (
    <div className={styles.occurrenceCancelledNotice}>
      <p className={styles.occurrenceCancelledLabel}>{mark.label}</p>
      <p>{mark.authorship}</p>
      <p>{mark.reason}</p>
    </div>
  )
}
