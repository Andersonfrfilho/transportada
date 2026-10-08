/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 253 RF10-RF12: geometria pura do PDF de canhotos (A4, em centímetros). O bloco nunca é cortado:
 * o que não cabe abre a página seguinte.
 */
export const PROOF_IMAGE_MIN_HEIGHT_CM = 5
export const PROOF_IMAGE_MAX_HEIGHT_CM = 7
export const PROOF_PAGE_WIDTH_CM = 21
export const PROOF_PAGE_HEIGHT_CM = 29.7
export const PROOF_PAGE_MARGIN_CM = 1.5
export const PROOF_HEADER_HEIGHT_CM = 1.2
export const PROOF_FOOTER_HEIGHT_CM = 0.8
export const PROOF_INFO_HEIGHT_CM = 1.6
export const PROOF_BLOCK_GAP_CM = 0.4

const MARGIN_COUNT = 3

export const PROOF_USABLE_WIDTH_CM = PROOF_PAGE_WIDTH_CM - 2 * PROOF_PAGE_MARGIN_CM
export const PROOF_USABLE_HEIGHT_CM =
  PROOF_PAGE_HEIGHT_CM -
  MARGIN_COUNT * PROOF_PAGE_MARGIN_CM -
  PROOF_HEADER_HEIGHT_CM -
  PROOF_FOOTER_HEIGHT_CM

export type ProofImageSize = {
  readonly heightPx: number
  readonly widthPx: number
}

export type ProofBlockPlacement = {
  readonly blockHeightCm: number
  readonly imageTopCm: number
  readonly pageNumber: number
  readonly topCm: number
}

export type ProofCursor = {
  readonly nextTopCm: number
  readonly pageNumber: number
}

export type ProofPagination = {
  readonly pageCount: number
  readonly placements: readonly ProofBlockPlacement[]
}

export const PROOF_INITIAL_CURSOR: ProofCursor = { nextTopCm: 0, pageNumber: 1 }

/** Foto em pé vira horizontal girando 90 graus; as dimensões já chegam com a orientação EXIF aplicada. */
export function shouldRotateProofImage(size: ProofImageSize): boolean {
  return size.heightPx > size.widthPx
}

export function resolveProofImageHeightCm(size: ProofImageSize): number {
  const isRotated = shouldRotateProofImage(size)
  const horizontalWidthPx = isRotated ? size.heightPx : size.widthPx
  const horizontalHeightPx = isRotated ? size.widthPx : size.heightPx
  const proportionalHeightCm = (PROOF_USABLE_WIDTH_CM * horizontalHeightPx) / horizontalWidthPx
  return Math.min(
    PROOF_IMAGE_MAX_HEIGHT_CM,
    Math.max(PROOF_IMAGE_MIN_HEIGHT_CM, proportionalHeightCm),
  )
}

export function resolveProofBlockHeightCm(imageHeightCm: number): number {
  return PROOF_INFO_HEIGHT_CM + imageHeightCm + PROOF_BLOCK_GAP_CM
}

export function placeProofBlock(params: {
  readonly blockHeightCm: number
  readonly cursor: ProofCursor
}): { readonly cursor: ProofCursor; readonly placement: ProofBlockPlacement } {
  const { blockHeightCm } = params
  const { nextTopCm, pageNumber } = params.cursor
  const doesFit = nextTopCm === 0 || nextTopCm + blockHeightCm <= PROOF_USABLE_HEIGHT_CM + 1e-9
  const placedPage = doesFit ? pageNumber : pageNumber + 1
  const topCm = doesFit ? nextTopCm : 0
  return {
    cursor: { nextTopCm: topCm + blockHeightCm, pageNumber: placedPage },
    placement: {
      blockHeightCm,
      imageTopCm: topCm + PROOF_INFO_HEIGHT_CM,
      pageNumber: placedPage,
      topCm,
    },
  }
}

export function paginateProofBlocks(imageHeightsCm: readonly number[]): ProofPagination {
  let cursor = PROOF_INITIAL_CURSOR
  const placements: ProofBlockPlacement[] = []
  for (const imageHeightCm of imageHeightsCm) {
    const placed = placeProofBlock({
      blockHeightCm: resolveProofBlockHeightCm(imageHeightCm),
      cursor,
    })
    cursor = placed.cursor
    placements.push(placed.placement)
  }
  return { pageCount: cursor.pageNumber, placements }
}
