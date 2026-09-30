/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 RF21: a ordem e a navegação do visualizador de comprovantes.
 *
 * Puro porque o teste desta app não tem DOM: as pontas que param e o botão que some com uma imagem
 * só se provam na função, e o diálogo apenas obedece.
 */
import type { DeliveryProof, DeliveryProofView } from './deliveryProof.service'

export type DeliveryProofGalleryNavigation = Readonly<{
  canGoNext: boolean
  canGoPrevious: boolean
  hasNavigation: boolean
  nextIndex: number
  previousIndex: number
}>

/** Assinatura, canhoto, mercadoria — a ordem dos grupos na tela, e em cada grupo a ordem em que a tela o mostra. */
export function buildDeliveryProofGallery(view: DeliveryProofView): readonly DeliveryProof[] {
  return [...view.signatures, ...view.photos, ...view.cargoPhotos].filter(
    (proof) => proof.downloadUrl !== '',
  )
}

export function resolveDeliveryProofGalleryStartIndex(params: {
  readonly gallery: readonly DeliveryProof[]
  readonly proofId: string
}): number {
  const index = params.gallery.findIndex((proof) => proof.id === params.proofId)
  return index === -1 ? 0 : index
}

/** As pontas param: não há volta do fim para o começo. */
export function resolveDeliveryProofGalleryNavigation(params: {
  readonly count: number
  readonly currentIndex: number
}): DeliveryProofGalleryNavigation {
  const lastIndex = params.count - 1
  const canGoPrevious = params.currentIndex > 0
  const canGoNext = params.currentIndex < lastIndex

  return {
    canGoNext,
    canGoPrevious,
    hasNavigation: params.count > 1,
    nextIndex: canGoNext ? params.currentIndex + 1 : params.currentIndex,
    previousIndex: canGoPrevious ? params.currentIndex - 1 : params.currentIndex,
  }
}
