/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'

import type { TripDocumentProofBadges as TripDocumentProofBadgesValue } from '../shared/tripDocumentProofBadges.service'
import styles from '../styles/trip.module.css'

import { ProofReviewChip } from './ProofReviewChip.component'

const PUNCTUALITY_BADGE_VARIANT = {
  on_time: 'success',
  late: 'warning',
  away: 'warning',
  late_and_away: 'warning',
} as const

type TripDocumentProofBadgesProps = Readonly<{
  badges: TripDocumentProofBadgesValue | undefined
}>

/** Spec 227 D4: dois selos lado a lado, o de conferência e o de pontualidade; o rótulo diz, não só a cor. */
export function TripDocumentProofBadges({ badges }: TripDocumentProofBadgesProps) {
  const { t } = useTranslation('trip')
  if (badges === undefined) return null
  const { punctuality, review } = badges

  return (
    <span className={styles.proofBadges} data-part="proof-badges">
      {review === undefined ? null : <ProofReviewChip outcome={review} />}
      {punctuality === undefined ? null : (
        <Badge variant={PUNCTUALITY_BADGE_VARIANT[punctuality]}>
          {t(`deliveryProof.punctuality.${punctuality}`)}
        </Badge>
      )}
    </span>
  )
}
