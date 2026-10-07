/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
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
import { ProofImage } from './ProofImage.component'
import { ProofPieces } from './ProofPieces.component'
import { ProofReadings } from './ProofReadings.component'
import { ProofReview, type CanhotoReviewActions } from './ProofReview.component'
import { ProofReviewActions, ProofReviewDeadline } from './ProofReviewActions.component'
import { TripDeliveryProofDetail } from './TripDeliveryProofDetail.component'

type TripDeliveryProofProps = Readonly<{
  /** Spec 181 RF7: as duas expansões abaixo precisam de um id estável por nota. */
  documentId: string
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
  products,
  reviewActions,
  view,
}: TripDeliveryProofProps) {
  const { t } = useTranslation('trip')
  const formatMoment = useMomentFormatter()
  const [openProofId, setOpenProofId] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)

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
        <TripDeliveryProofDetail documentId={documentId} products={products} />
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
        <TripDeliveryProofDetail documentId={documentId} products={products} />
      </>
    )
  }

  const gallery = buildDeliveryProofGallery(view)
  const pieces = resolveDeliveryProofPieces(view)
  const reviewed = pieces.main?.proof
  const outcome = reviewed === undefined ? undefined : resolveDeliveryProofOutcome(reviewed)
  const isPending = reviewed !== undefined && outcome === 'pending'
  const titleId = `trip-delivery-proof-title-${documentId}`
  const detailsId = `trip-delivery-proof-details-${documentId}`
  const summary = [
    view.deliveredAt === null
      ? null
      : t('deliveryProof.deliveredAt', { moment: formatMoment(view.deliveredAt) }),
    view.receiverName === null ? null : t('deliveryProof.receiver', { name: view.receiverName }),
    view.state === 'delivered-without-proof' ? t('deliveryProof.withoutProof') : null,
  ].filter((part): part is string => part !== null)

  function handleProofClose(): void {
    setOpenProofId(null)
  }

  function handleToggle(): void {
    setIsExpanded((current) => !current)
  }

  return (
    <section aria-labelledby={titleId} className={styles.proofCard}>
      {/*
       * Spec 233 (revisão de design): o comprovante nasce **compacto** — miniatura, rótulo e o resumo
       * da baixa numa linha —, e o botão do título o expande (mesmo padrão `aria-expanded`/
       * `aria-controls` dos itens, abaixo). Os selos de conferência e pontualidade não se repetem
       * aqui: moram no cabeçalho da nota, um lugar só. A miniatura é irmã do botão, nunca filha.
       */}
      <div className={styles.proofSummary}>
        {pieces.main === undefined || isExpanded ? null : (
          <ProofImage
            alt={t(pieces.main.altKey)}
            label={t(pieces.main.labelKey)}
            onOpen={setOpenProofId}
            proof={pieces.main.proof}
            variant="summary"
          />
        )}
        <h4 className={styles.proofSummaryHeading}>
          <button
            aria-controls={detailsId}
            aria-expanded={isExpanded}
            className={styles.proofSummaryToggle}
            onClick={handleToggle}
            type="button"
          >
            <span className={styles.proofSummaryText}>
              <span className={styles.proofCardTitle} id={titleId}>
                {t('deliveryProof.title')}
              </span>
              {summary.length === 0 ? null : (
                <span className={styles.proofSummaryMeta}>{summary.join(' · ')}</span>
              )}
            </span>
            <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} />
          </button>
        </h4>
      </div>
      {isExpanded ? (
        <div className={styles.proofDetails} id={detailsId}>
          <ProofPieces onOpen={setOpenProofId} pieces={pieces} />
          {reviewed === undefined ? null : (
            <ProofReadings deliveredAt={view.deliveredAt} proof={reviewed} />
          )}
          {reviewed === undefined ? null : <ProofReview proof={reviewed} />}
        </div>
      ) : null}
      {isPending ? (
        <footer className={styles.proofCardFooter}>
          <ProofReviewDeadline proof={reviewed} />
          <div className={styles.proofCardActions}>
            <ProofReviewActions {...reviewActions} proof={reviewed} />
          </div>
        </footer>
      ) : null}
      <TripDeliveryProofDetail documentId={documentId} products={products} />
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
