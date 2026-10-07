/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 T7.8: o veredito do canhoto no item da nota. O estado curto vive no cabeçalho do card
 * (`ProofReviewChip`) e os botões no rodapé (`ProofReviewActions`); aqui fica a frase por extenso. A tradução veredito -> tela é da
 * `presentCanhotoReview`; aqui só se escolhe o texto e o selo. Sem veredito, nada é renderizado.
 */
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { useMomentFormatter } from '@/modules/shared/useMomentFormatter.hook'

import {
  presentCanhotoReview,
  type CanhotoReviewMessageKey,
  type CanhotoReviewPresentation,
} from '../shared/canhotoReviewPresentation.service'
import type { DeliveryProof } from '../shared/deliveryProof.service'
import styles from '../styles/trip.module.css'

/**
 * O selo da conferência mora no cabeçalho da nota (`TripDocumentProofBadges`); aqui só o texto que o
 * selo não diz. Estes dois estados dizem o mesmo que ele ("Aguardando conferência", "Recusado") e
 * não ganham a frase — a recusa ainda mostra o motivo.
 */
const MESSAGES_ALREADY_IN_HEADER_BADGE: ReadonlySet<CanhotoReviewMessageKey> = new Set([
  'pendingUnread',
  'rejected',
])

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
  const hasMessage = !MESSAGES_ALREADY_IN_HEADER_BADGE.has(messageKey)

  return (
    <div className={styles.proofReviewText}>
      {hasMessage || isExperimental ? (
        <p className={styles.hint}>
          {hasMessage ? describeReview(presentation, t, formatMoment) : null}
          {isExperimental ? (
            <Badge variant="secondary">{t('deliveryProof.canhotoReview.experimental')}</Badge>
          ) : null}
        </p>
      ) : null}
      {reason === undefined ? null : (
        <p className={styles.hint}>{t(`deliveryProof.canhotoReview.reason.${reason}`)}</p>
      )}
      {note === undefined ? null : <p className={styles.hint}>{note}</p>}
    </div>
  )
}
