/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 T7.8: o veredito do canhoto no item da nota. O estado curto vive no cabeçalho do card
 * (`ProofReviewChip`) e os botões no rodapé (`ProofReviewActions`); aqui fica a frase por extenso. A tradução veredito -> tela é da
 * `presentCanhotoReview`; aqui só se escolhe o texto e o selo. Sem veredito, nada é renderizado.
 */
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { Badge, type BadgeProps } from '@/components/ui/badge'
import { useMomentFormatter } from '@/modules/shared/useMomentFormatter.hook'

import {
  presentCanhotoReview,
  type CanhotoReviewMessageKey,
  type CanhotoReviewPresentation,
} from '../shared/canhotoReviewPresentation.service'
import type { DeliveryProof } from '../shared/deliveryProof.service'
import styles from '../styles/trip.module.css'

/** O design system não tem variante de perigo: a recusa fica em `warning`, já medida em AA. */
const REVIEW_BADGE_VARIANT = {
  approvedAutomatic: 'success',
  approvedManual: 'success',
  approvedManualUnknown: 'success',
  pendingBarcode: 'info',
  pendingOcr: 'info',
  pendingUnread: 'info',
  rejected: 'warning',
} as const satisfies Record<CanhotoReviewMessageKey, BadgeProps['variant']>

function describeReview(
  presentation: CanhotoReviewPresentation,
  t: TFunction<'trip'>,
  formatMoment: (value: string) => string,
): string {
  const { messageKey, readNumber, reviewedAt, reviewerName } = presentation
  return t(`deliveryProof.canhotoReview.${messageKey}`, {
    moment: reviewedAt === undefined ? '' : formatMoment(reviewedAt),
    name: reviewerName ?? '',
    number: readNumber ?? '',
  })
}

export type CanhotoReviewActions = Readonly<{
  /** Vem de `workspace.controller.canManageTrips`; sem ele os botões nem entram no DOM. */
  canReview: boolean
  onApprove: () => void
  onReject: () => void
}>

export type ProofReviewProps = Readonly<{ proof: DeliveryProof }>

export function ProofReview({ proof }: ProofReviewProps) {
  const { t } = useTranslation('trip')
  const formatMoment = useMomentFormatter()
  const presentation = presentCanhotoReview(proof)
  if (presentation === undefined) return null

  const { isExperimental, messageKey, note, reason } = presentation

  return (
    <div className={styles.hint}>
      <div className={styles.proofBadges}>
        <Badge variant={REVIEW_BADGE_VARIANT[messageKey]}>
          {describeReview(presentation, t, formatMoment)}
        </Badge>
        {isExperimental ? (
          <Badge variant="secondary">{t('deliveryProof.canhotoReview.experimental')}</Badge>
        ) : null}
      </div>
      {reason === undefined ? null : <p>{t(`deliveryProof.canhotoReview.reason.${reason}`)}</p>}
      {note === undefined ? null : <p>{note}</p>}
    </div>
  )
}
