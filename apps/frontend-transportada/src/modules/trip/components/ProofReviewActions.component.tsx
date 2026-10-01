/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { DeliveryProof } from '../shared/deliveryProof.service'
import { formatDeliveryProofTime } from '../shared/deliveryProofCard.service'

import type { CanhotoReviewActions } from './ProofReview.component'

export function ProofReviewDeadline({ proof }: Readonly<{ proof: DeliveryProof }>) {
  const { i18n, t } = useTranslation('trip')
  const time = formatDeliveryProofTime({
    locale: i18n.resolvedLanguage ?? 'pt-BR',
    value: proof.createdAt,
  })

  return <span>{t('deliveryProof.pendingSince', { time })}</span>
}

/** Sem `trip.manage` ou com o veredito já dado, nenhum botão entra no DOM. */
export function ProofReviewActions({
  canReview,
  onApprove,
  onReject,
  proof,
}: CanhotoReviewActions & Readonly<{ proof: DeliveryProof }>) {
  const { t } = useTranslation('trip')
  if (!canReview || proof.canhotoReview !== 'pending') return null

  return (
    <>
      <Button onClick={onReject} size="sm" type="button" variant="secondary">
        <Icon name="close" />
        {t('deliveryProof.canhotoReview.reject')}
      </Button>
      <Button onClick={onApprove} size="sm" type="button">
        <Icon name="check" />
        {t('deliveryProof.canhotoReview.approve')}
      </Button>
    </>
  )
}
