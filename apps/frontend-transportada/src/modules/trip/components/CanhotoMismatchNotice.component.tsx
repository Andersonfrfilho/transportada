/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T5 (D8.1): a faixa "Parece ser da NF X" no comprovante e no maço. O OCR só sugere; a
 * faixa avisa, não bloqueia. Mesmo molde do `pendingOcr`: texto do design system e o selo
 * "Experimental" que a leitura OCR já ganha.
 */
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'

import {
  presentCanhotoMismatch,
  resolveCanhotoMismatch,
} from '../shared/canhotoMismatchPresentation.service'
import type { DeliveryProof } from '../shared/deliveryProof.service'
import styles from '../styles/trip.module.css'

export function CanhotoMismatchNotice({ proof }: Readonly<{ proof: DeliveryProof }>) {
  const { t } = useTranslation('trip')
  const mismatch = resolveCanhotoMismatch(proof)
  if (mismatch === undefined) return null

  const { details, headlineKey, number, series } = presentCanhotoMismatch(mismatch)

  return (
    <div className={styles.canhotoMismatchNotice} data-testid="canhoto-mismatch" role="status">
      <p className={styles.canhotoMismatchHeadline}>
        <Icon aria-hidden="true" name="alert" />
        {t(`deliveryProof.canhotoMismatch.${headlineKey}`, { number, series })}
        <Badge variant="secondary">{t('deliveryProof.canhotoReview.experimental')}</Badge>
      </p>
      {details.map((detail) => (
        <p className={styles.hint} key={detail}>
          {t(`deliveryProof.canhotoMismatch.detail.${detail}`, { number })}
        </p>
      ))}
    </div>
  )
}
