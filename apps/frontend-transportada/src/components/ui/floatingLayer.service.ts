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
 * Quando o piso de altura passa do espaço que sobrou, a camada é **puxada para dentro** em vez de
 * vazar: encostada no gatilho ela sairia da tela, e o certo é ela encostar na margem da janela.
 */
function resolveOffsets(
  input: Readonly<{
    anchor: FloatingAnchorRect
    maxHeight: number
    placement: FloatingLayerPlacement
    viewport: FloatingViewportSize
  }>,
): Readonly<{ bottom: number | null; top: number | null }> {
  const furthest = Math.max(
    input.viewport.height - input.maxHeight - FLOATING_LAYER_VIEWPORT_MARGIN,
    FLOATING_LAYER_VIEWPORT_MARGIN,
  )

  if (input.placement === 'below') {
    const preferred = input.anchor.bottom + FLOATING_LAYER_GAP
    return { bottom: null, top: clamp(preferred, FLOATING_LAYER_VIEWPORT_MARGIN, furthest) }
  }

  const preferred = input.viewport.height - input.anchor.top + FLOATING_LAYER_GAP
  return { bottom: clamp(preferred, FLOATING_LAYER_VIEWPORT_MARGIN, furthest), top: null }
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
  /**
   * O piso de altura é o que mantém a camada legível em tela baixa, mas ele **não pode ser maior
   * que a janela**: sem o teto, um gatilho perto do rodapé com pouco espaço abaixo recebia 96px de
   * altura e a lista terminava fora da tela, empurrando o scroll da página.
   */
  const viewportLimit = Math.max(
    viewport.height - FLOATING_LAYER_VIEWPORT_MARGIN * 2,
    FLOATING_LAYER_MIN_HEIGHT,
  )
  const maxHeight = Math.min(Math.max(available, FLOATING_LAYER_MIN_HEIGHT), viewportLimit)
  const width = Math.max(layer.width, anchor.width)

  return {
    left: resolveLeft({ align, anchor, width }, viewport),
    maxHeight,
    minWidth: anchor.width,
    placement,
    ...resolveOffsets({ anchor, maxHeight, placement, viewport }),
  }
}

/**
 * A camada só existe presa a um gatilho. Quando a rolagem leva o gatilho para fora da janela, ela
 * fica órfã: continua aberta, no meio da tela, deslizando junto com a página e sem nada ao lado que
 * explique de onde saiu — foi assim que ela passou a "acompanhar o scroll".
 *
 * O critério é **interseção**, não contenção: gatilho meio cortado na borda ainda é um gatilho que
 * se vê, e fechar a lista nesse ponto tiraria a escolha da mão de quem está rolando para ler o fim
 * dela.
 */
export function isAnchorVisible(
  input: Readonly<{ anchor: FloatingAnchorRect; viewport: FloatingViewportSize }>,
): boolean {
  return (
    input.anchor.bottom > 0 &&
    input.anchor.top < input.viewport.height &&
    input.anchor.right > 0 &&
    input.anchor.left < input.viewport.width
  )
}
