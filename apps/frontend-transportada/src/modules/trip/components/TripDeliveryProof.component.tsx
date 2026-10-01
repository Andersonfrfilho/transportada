/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useMomentFormatter } from '@/modules/shared/useMomentFormatter.hook'

import type { DeliveryProofView } from '../shared/deliveryProof.service'
import {
  resolveDeliveryProofOutcome,
  resolveDeliveryProofPieces,
} from '../shared/deliveryProofCard.service'
import {
  buildDeliveryProofGallery,
  resolveDeliveryProofGalleryStartIndex,
} from '../shared/deliveryProofGallery.service'
import type { TripDocumentProduct } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

import { ProofGalleryDialog } from './ProofGalleryDialog.component'
import { ProofPieces } from './ProofPieces.component'
import { ProofReadings } from './ProofReadings.component'
import { ProofReview, type CanhotoReviewActions } from './ProofReview.component'
import { ProofReviewActions, ProofReviewDeadline } from './ProofReviewActions.component'
import { ProofReviewChip } from './ProofReviewChip.component'
import { TripDeliveryProofDetail } from './TripDeliveryProofDetail.component'

type TripDeliveryProofProps = Readonly<{
  /** Spec 181 RF7: as duas expansões abaixo precisam de um id estável por nota. */
  documentId: string
  /** Spec 079 T020: o que houve com a carga. Só anota — ver `TripOccurrences`. */
  occurrences: React.ReactNode
  /** Spec 079 T019: o que vai dentro da nota, conferido de pé no galpão. */
  products: readonly TripDocumentProduct[]
  reviewActions: CanhotoReviewActions
  view: DeliveryProofView
}>

/**
 * Spec 079 T006/T025: o canhoto que o motorista anexou, do lado do escritório.
 *
 * ⚠️ **A URL assinada expira em cinco minutos e não é guardada em estado.** Uma tela que a copia
 * para dentro de um `useState` e a reusa depois mostra imagem quebrada sem dizer por quê — o
 * componente lê direto o que a consulta trouxe, e recarregar a consulta é o que renova a URL.
 *
 * Os quatro estados chegam inteiros aqui: "entregue sem comprovante" e "não entregue" têm textos
 * diferentes de propósito, porque são fatos diferentes (ver `deliveryProof.service.ts`).
 */
export function TripDeliveryProof({
  documentId,
  occurrences,
  products,
  reviewActions,
  view,
}: TripDeliveryProofProps) {
  const { t } = useTranslation('trip')
  const formatMoment = useMomentFormatter()
  const [openProofId, setOpenProofId] = useState<string | null>(null)

  /**
   * ⚠️ **A lista de itens continua alcançável em todos os estados**, inclusive antes de a nota ser
   * entregue: é justamente antes que alguém confere se a carga está completa. Amarrá-la à entrega
   * esconderia a informação de quem mais precisa dela — RF7 pede que ela pare de ser despejada
   * **incondicionalmente**, não que ela suma de algum estado.
   */
  if (view.state === 'not-delivered') {
    return (
      <>
        <p className={styles.hint}>{t('deliveryProof.notDelivered')}</p>
        <TripDeliveryProofDetail
          documentId={documentId}
          occurrences={occurrences}
          products={products}
        />
      </>
    )
  }

  if (view.state === 'returned') {
    return (
      <>
        <p className={styles.hint}>
          {view.returnReason === null || view.returnReason === ''
            ? t('deliveryProof.returnedWithoutReason')
            : t('deliveryProof.returned', {
                /**
                 * `returnReason` é código (`recipient_absent`), não texto: o dicionário vive em
                 * `fieldActions.returnReason`. A linha do tempo já traduzia; aqui o código cru saía
                 * em inglês na cara do operador. Código sem tradução cai nele mesmo — feio, mas
                 * some-lo esconderia o motivo da devolução.
                 */
                reason: t(`fieldActions.returnReason.${view.returnReason}`, {
                  defaultValue: view.returnReason,
                }),
              })}
        </p>
        <TripDeliveryProofDetail
          documentId={documentId}
          occurrences={occurrences}
          products={products}
        />
      </>
    )
  }

  const gallery = buildDeliveryProofGallery(view)
  const pieces = resolveDeliveryProofPieces(view)
  const reviewed = pieces.main?.proof
  const outcome = reviewed === undefined ? undefined : resolveDeliveryProofOutcome(reviewed)
  const isPending = reviewed !== undefined && outcome === 'pending'

  function handleProofClose(): void {
    setOpenProofId(null)
  }

  return (
    <section aria-labelledby="trip-delivery-proof-title" className={styles.proofCard}>
      <header className={styles.proofCardHeader}>
        <h4 className={styles.proofCardTitle} id="trip-delivery-proof-title">
          {t('deliveryProof.title')}
        </h4>
        {outcome === undefined ? null : <ProofReviewChip outcome={outcome} />}
      </header>
      {view.deliveredAt === null ? null : (
        <p className={styles.hint}>
          {t('deliveryProof.deliveredAt', { moment: formatMoment(view.deliveredAt) })}
        </p>
      )}
      {view.receiverName === null ? null : (
        <p className={styles.hint}>{t('deliveryProof.receiver', { name: view.receiverName })}</p>
      )}
      {view.state === 'delivered-without-proof' ? (
        <p className={styles.hint}>{t('deliveryProof.withoutProof')}</p>
      ) : null}
      <ProofPieces onOpen={setOpenProofId} pieces={pieces} />
      {reviewed === undefined ? null : <ProofReadings proof={reviewed} />}
      {reviewed === undefined ? null : <ProofReview proof={reviewed} />}
      {isPending ? (
        <footer className={styles.proofCardFooter}>
          <ProofReviewDeadline proof={reviewed} />
          <div className={styles.proofCardActions}>
            <ProofReviewActions {...reviewActions} proof={reviewed} />
          </div>
        </footer>
      ) : null}
      <TripDeliveryProofDetail
        documentId={documentId}
        occurrences={occurrences}
        products={products}
      />
      {openProofId === null ? null : (
        <ProofGalleryDialog
          gallery={gallery}
          initialIndex={resolveDeliveryProofGalleryStartIndex({ gallery, proofId: openProofId })}
          onClose={handleProofClose}
        />
      )}
    </section>
  )
}
