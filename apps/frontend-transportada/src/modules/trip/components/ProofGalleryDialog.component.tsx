/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 RF21: visualizador dos comprovantes da entrega, sempre no original (`downloadUrl`).
 * Molde: `ProofImageLightbox` do app do motorista, sobre o `useModalDialog` do painel.
 */
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { DeliveryProof, DeliveryProofKind } from '../shared/deliveryProof.service'
import { resolveDeliveryProofFullSizeUrl } from '../shared/deliveryProof.service'
import { resolveDeliveryProofGalleryNavigation } from '../shared/deliveryProofGallery.service'
import styles from '../styles/trip.module.css'

const HISTORY_MARKER_KEY = 'proofGalleryDialog'

/** A distinção que a spec inteira existe para fazer também vale para quem não vê a imagem. */
const ALT_KEY_BY_KIND = {
  cargo: 'deliveryProof.cargoPhotoAlt',
  photo: 'deliveryProof.photoAlt',
  signature: 'deliveryProof.signatureAlt',
} as const satisfies Record<DeliveryProofKind, string>

type ProofGalleryDialogProps = Readonly<{
  gallery: readonly DeliveryProof[]
  initialIndex: number
  onClose: () => void
}>

function hasHistoryMarker(): boolean {
  const state: unknown = window.history.state
  return typeof state === 'object' && state !== null && HISTORY_MARKER_KEY in state
}

export function ProofGalleryDialog({ gallery, initialIndex, onClose }: ProofGalleryDialogProps) {
  const { t } = useTranslation('trip')
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  /** Guardar o id, e não um booleano, é o que faz o marcador voltar ao trocar de comprovante. */
  const [settledProofId, setSettledProofId] = useState<string | null>(null)
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose })

  // O efeito do histórico é por montagem; `onClose` muda de identidade a cada render do painel.
  const onCloseRef = useRef(onClose)
  const pendingUndoRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  /**
   * O botão voltar do Android dispara `popstate`: uma entrada reservada evita sair da tela inteira.
   *
   * Desfazer essa entrada na limpeza do efeito não serve: sob `StrictMode` o React monta, limpa e
   * monta de novo, e o `popstate` do `back()` chega depois da remontagem — medido na página, com
   * `state=null`, fechando o diálogo no mesmo clique que o abriu. O desfazer espera uma tarefa, e a
   * remontagem o cancela; só a saída de verdade chega a executá-lo.
   */
  useEffect(() => {
    if (pendingUndoRef.current === undefined) {
      window.history.pushState({ [HISTORY_MARKER_KEY]: true }, '')
    } else {
      clearTimeout(pendingUndoRef.current)
      pendingUndoRef.current = undefined
    }

    function handlePopState(): void {
      onCloseRef.current()
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
      pendingUndoRef.current = setTimeout(() => {
        pendingUndoRef.current = undefined
        if (hasHistoryMarker()) window.history.back()
      })
    }
  }, [])

  const proof = gallery[currentIndex]
  if (proof === undefined) return null

  const navigation = resolveDeliveryProofGalleryNavigation({
    count: gallery.length,
    currentIndex,
  })
  const position = currentIndex + 1
  const count = gallery.length
  const currentProofId = proof.id
  const hasSettled = settledProofId === currentProofId

  function handleSettled(): void {
    setSettledProofId(currentProofId)
  }

  function handlePrevious(): void {
    setCurrentIndex(navigation.previousIndex)
  }

  function handleNext(): void {
    setCurrentIndex(navigation.nextIndex)
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'ArrowLeft' && navigation.canGoPrevious) handlePrevious()
    if (event.key === 'ArrowRight' && navigation.canGoNext) handleNext()
    handleKeyDown(event)
  }

  return createPortal(
    <div
      aria-label={t('deliveryProof.galleryLabel')}
      aria-modal="true"
      className={styles.proofGalleryBackdrop}
      onClick={onClose}
      onKeyDown={handleDialogKeyDown}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className={styles.proofGalleryFrame} onClick={(event) => event.stopPropagation()}>
        {hasSettled ? null : (
          <SkeletonGroup label={t('deliveryProof.imageLoading')}>
            <Skeleton className={styles.proofGalleryPlaceholder} />
          </SkeletonGroup>
        )}
        <img
          alt={t(ALT_KEY_BY_KIND[proof.kind])}
          className={cn(
            styles.proofGalleryImage,
            hasSettled ? undefined : styles.proofGalleryImagePending,
          )}
          onError={handleSettled}
          onLoad={handleSettled}
          src={resolveDeliveryProofFullSizeUrl(proof)}
        />
        <div className={styles.proofGalleryControls}>
          {navigation.hasNavigation ? (
            <Button
              aria-label={t('deliveryProof.galleryPrevious')}
              disabled={!navigation.canGoPrevious}
              onClick={handlePrevious}
              type="button"
              variant="ghost"
            >
              <Icon name="chevron-left" />
            </Button>
          ) : null}
          {navigation.hasNavigation ? (
            <span aria-live="polite">{t('deliveryProof.galleryCounter', { count, position })}</span>
          ) : null}
          {navigation.hasNavigation ? (
            <Button
              aria-label={t('deliveryProof.galleryNext')}
              disabled={!navigation.canGoNext}
              onClick={handleNext}
              type="button"
              variant="ghost"
            >
              <Icon name="chevron-right" />
            </Button>
          ) : null}
          <Button onClick={onClose} type="button" variant="ghost">
            <Icon name="close" />
            {t('deliveryProof.galleryClose')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
