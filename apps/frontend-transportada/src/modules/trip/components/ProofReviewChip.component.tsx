/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { Badge, type BadgeProps } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import type { DeliveryProofCanhotoReview } from '../shared/deliveryProof.service'
import styles from '../styles/trip.module.css'

/** O design system não tem variante de perigo: a recusa fica em `warning`, já medida em AA. */
const OUTCOME_PRESENTATION = {
  approved: { className: styles.proofStatusApproved, variant: 'success' },
  pending: { className: styles.proofStatusPending, variant: 'info' },
  rejected: { className: styles.proofStatusRejected, variant: 'warning' },
} as const satisfies Record<
  DeliveryProofCanhotoReview,
  { className: string | undefined; variant: BadgeProps['variant'] }
>

export function ProofReviewChip({ outcome }: Readonly<{ outcome: DeliveryProofCanhotoReview }>) {
  const { t } = useTranslation('trip')
  const { className, variant } = OUTCOME_PRESENTATION[outcome]

  return (
    <Badge className={cn(styles.proofStatus, className)} variant={variant}>
      {t(`deliveryProof.reviewStatus.${outcome}`)}
    </Badge>
  )
}
