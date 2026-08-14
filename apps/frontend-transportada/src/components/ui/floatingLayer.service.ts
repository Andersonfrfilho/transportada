/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Respiro entre o gatilho e a camada, no mesmo passo da grade de espaçamento. */
export const FLOATING_LAYER_GAP = 4
/** A camada nunca encosta na borda da janela: sobra para a sombra e para o dedo. */
export const FLOATING_LAYER_VIEWPORT_MARGIN = 8
/** Em tela muito baixa vale mais uma camada rolável do que uma faixa ilegível. */
export const FLOATING_LAYER_MIN_HEIGHT = 96

export type FloatingLayerAlign = 'end' | 'start'
export type FloatingLayerPlacement = 'above' | 'below'

export type FloatingAnchorRect = Readonly<{
  bottom: number
  left: number
  right: number
  top: number
  width: number
}>

export type FloatingLayerSize = Readonly<{ height: number; width: number }>
export type FloatingViewportSize = Readonly<{ height: number; width: number }>

export type FloatingLayerPosition = Readonly<{
  bottom: number | null
  left: number
  maxHeight: number
  minWidth: number
  placement: FloatingLayerPlacement
  top: number | null
}>

export type ResolveFloatingLayerPositionParams = Readonly<{
  anchor: FloatingAnchorRect
  layer: FloatingLayerSize
  viewport: FloatingViewportSize
  align?: FloatingLayerAlign
}>

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function resolveLeft(
  input: Readonly<{ align: FloatingLayerAlign; anchor: FloatingAnchorRect; width: number }>,
  viewport: FloatingViewportSize,
): number {
  const preferred = input.align === 'end' ? input.anchor.right - input.width : input.anchor.left
  const furthest = Math.max(
    viewport.width - input.width - FLOATING_LAYER_VIEWPORT_MARGIN,
    FLOATING_LAYER_VIEWPORT_MARGIN,
  )
  return clamp(preferred, FLOATING_LAYER_VIEWPORT_MARGIN, furthest)
}

/**
 * Posiciona a camada em coordenadas de viewport, para ela sair de qualquer ancestral com
 * `overflow` — dentro de um modal ou de uma tabela rolável a lista era recortada na borda.
 *
 * Acima do gatilho a camada é ancorada pela **borda de baixo**: o teto de altura é do CSS de cada
 * pele, e calcular o topo pela altura medida do conteúdo jogava o painel na borda da janela.
 */
export function resolveFloatingLayerPosition({
  align = 'start',
  anchor,
  layer,
  viewport,
}: ResolveFloatingLayerPositionParams): FloatingLayerPosition {
  const spaceBelow = viewport.height - anchor.bottom - FLOATING_LAYER_GAP
  const spaceAbove = anchor.top - FLOATING_LAYER_GAP
  const placement: FloatingLayerPlacement =
    layer.height > spaceBelow && spaceAbove > spaceBelow ? 'above' : 'below'
  const available =
    (placement === 'below' ? spaceBelow : spaceAbove) - FLOATING_LAYER_VIEWPORT_MARGIN
  const maxHeight = Math.max(available, FLOATING_LAYER_MIN_HEIGHT)
  const width = Math.max(layer.width, anchor.width)

  return {
    bottom: placement === 'below' ? null : viewport.height - anchor.top + FLOATING_LAYER_GAP,
    left: resolveLeft({ align, anchor, width }, viewport),
    maxHeight,
    minWidth: anchor.width,
    placement,
    top: placement === 'below' ? anchor.bottom + FLOATING_LAYER_GAP : null,
  }
}
