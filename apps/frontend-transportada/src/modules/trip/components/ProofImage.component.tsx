/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 T5.8: a miniatura do comprovante e o aviso de que ela está a caminho.
 *
 * A imagem vem por URL assinada, sobre a rede do galpão: entre o render e o pixel há um buraco que
 * não dizia nada. O marcador ocupa esse buraco e sai quando a imagem **resolve** — carregando ou
 * falhando. Falhar conta: marcador que gira para sempre mente mais do que o buraco que substituiu.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import {
  resolveDeliveryProofImageSource,
  type DeliveryProof,
} from '../shared/deliveryProof.service'
import styles from '../styles/trip.module.css'

export type ProofImageOutcome = 'failed' | 'loaded'

type ProofImageProps = Readonly<{
  alt: string
  /** Quem decide com base na foto (spec 222) precisa dela já, não quando a rolagem chegar perto. */
  isEager?: boolean
  label: string
  onOpen: (proofId: string) => void
  /** Diz **como** a imagem resolveu — `hasSettled` só sabe que resolveu. */
  onSettled?: (outcome: ProofImageOutcome) => void
  proof: DeliveryProof
  /** Fora da sequência de Tab (`-1`) quando a foto abre por tecla da nota em foco (spec 222 T8.1). */
  tabIndex?: number
  /** `summary` é a miniatura da linha-resumo do comprovante fechado: sem legenda, do tamanho do alvo de toque. */
  variant: 'main' | 'summary' | 'thumbnail'
}>

/** Sem original (`downloadUrl` vazio) a galeria não o contém: fica só a miniatura, sem botão. */
export function ProofImage({
  alt,
  isEager = false,
  label,
  onOpen,
  onSettled,
  proof,
  tabIndex,
  variant,
}: ProofImageProps) {
  const { t } = useTranslation('trip')
  const [hasSettled, setHasSettled] = useState(false)

  const source = resolveDeliveryProofImageSource(proof)
  const canOpen = proof.downloadUrl !== ''
  /** Sem fonte não há evento para esperar — o marcador ficaria preso no vazio. */
  const isWaiting = source !== '' && !hasSettled

  function handleLoad(): void {
    setHasSettled(true)
    onSettled?.('loaded')
  }

  function handleError(): void {
    setHasSettled(true)
    onSettled?.('failed')
  }

  function handleOpen(): void {
    onOpen(proof.id)
  }

  const isMain = variant === 'main'
  const isSummary = variant === 'summary'
  const thumbnail = (
    <img
      alt={alt}
      className={cn(
        styles.deliveryProofImage,
        !isMain && styles.proofThumbnailImage,
        isSummary && styles.proofSummaryImage,
        isWaiting && styles.deliveryProofImagePending,
      )}
      loading={isEager ? 'eager' : 'lazy'}
      onError={handleError}
      onLoad={handleLoad}
      src={source}
    />
  )

  return (
    <figure
      className={cn(
        isMain ? styles.proofMain : styles.proofThumbnail,
        isSummary && styles.proofSummaryFigure,
      )}
    >
      <div className={styles.deliveryProofImageFrame}>
        {isWaiting ? (
          <SkeletonGroup label={t('deliveryProof.imageLoading')}>
            <Skeleton className={styles.deliveryProofImagePlaceholder} />
          </SkeletonGroup>
        ) : null}
        {canOpen ? (
          <button
            aria-label={t('deliveryProof.open')}
            className={isMain ? styles.deliveryProofImageButton : styles.proofThumbnailButton}
            onClick={handleOpen}
            tabIndex={tabIndex}
            type="button"
          >
            {thumbnail}
          </button>
        ) : (
          thumbnail
        )}
        {isMain ? <span className={styles.proofPieceOverlay}>{label}</span> : null}
      </div>
      {isMain || isSummary ? null : (
        <figcaption className={styles.proofPieceCaption}>{label}</figcaption>
      )}
    </figure>
  )
}
