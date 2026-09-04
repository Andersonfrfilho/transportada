/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'

import {
  isAnchorVisible,
  resolveFloatingLayerPosition,
  type FloatingLayerAlign,
  type FloatingLayerPosition,
} from './floatingLayer.service'

type UseFloatingLayerInput = Readonly<{
  isOpen: boolean
  onDismiss: () => void
  align?: FloatingLayerAlign
}>

type UseFloatingLayerResult<TLayer extends HTMLElement> = Readonly<{
  anchorRef: RefObject<HTMLDivElement | null>
  layerRef: RefObject<TLayer | null>
  layerStyle: CSSProperties | undefined
}>

function samePosition(left: FloatingLayerPosition, right: FloatingLayerPosition): boolean {
  return (
    left.bottom === right.bottom &&
    left.left === right.left &&
    left.maxHeight === right.maxHeight &&
    left.minWidth === right.minWidth &&
    left.top === right.top
  )
}

function toEdge(value: number | null): string {
  return value === null ? 'auto' : `${String(value)}px`
}

function toStyle(position: FloatingLayerPosition | null): CSSProperties | undefined {
  if (position === null) return undefined
  return {
    '--floating-layer-bottom': toEdge(position.bottom),
    '--floating-layer-left': `${String(position.left)}px`,
    '--floating-layer-max-height': `${String(position.maxHeight)}px`,
    '--floating-layer-min-width': `${String(position.minWidth)}px`,
    '--floating-layer-top': toEdge(position.top),
  } as CSSProperties
}

/**
 * Camada flutuante ancorada em coordenadas de viewport: quem a consome renderiza em portal,
 * porque dentro de um ancestral com `overflow` — modal, tabela rolável — ela seria recortada.
 */
export function useFloatingLayer<TLayer extends HTMLElement>({
  align,
  isOpen,
  onDismiss,
}: UseFloatingLayerInput): UseFloatingLayerResult<TLayer> {
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const layerRef = useRef<TLayer | null>(null)
  const dismissRef = useRef(onDismiss)
  const [position, setPosition] = useState<FloatingLayerPosition | null>(null)

  dismissRef.current = onDismiss

  const measure = useCallback((): void => {
    const anchor = anchorRef.current
    const layer = layerRef.current
    if (anchor === null || layer === null) return

    const rect = anchor.getBoundingClientRect()
    const viewport = { height: window.innerHeight, width: window.innerWidth }
    const anchorRect = {
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
    }

    /** Gatilho fora da janela: a camada não tem mais a que se prender, então ela fecha. */
    if (!isAnchorVisible({ anchor: anchorRect, viewport })) {
      // TEMPORÁRIO — diagnóstico do smoke 424, remover depois de ler o log da CI.
      console.warn(
        `[fl] dismiss=anchor-invisible top=${Math.round(anchorRect.top)} bottom=${Math.round(anchorRect.bottom)} vh=${viewport.height}`,
      )
      dismissRef.current()
      return
    }

    // TEMPORÁRIO — diagnóstico do smoke 424, remover depois de ler o log da CI.
    console.warn(
      `[fl] measure anchorTop=${Math.round(anchorRect.top)} anchorBottom=${Math.round(anchorRect.bottom)} vh=${viewport.height} layerH=${layer.scrollHeight}`,
    )

    const next = resolveFloatingLayerPosition({
      ...(align === undefined ? {} : { align }),
      anchor: anchorRect,
      layer: { height: layer.scrollHeight, width: layer.offsetWidth },
      viewport,
    })

    setPosition((current) => (current !== null && samePosition(current, next) ? current : next))
  }, [align])

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null)
      return undefined
    }
    measure()

    /**
     * Rolar a página **fecha** a camada, em vez de arrastá-la junto. Presa ao gatilho ela atravessa
     * a tela enquanto se rola, e quem rolou estava indo ler outra coisa — não escolher.
     *
     * A rolagem **de dentro** da própria lista é a exceção: é assim que se chega ao fim das opções,
     * e fechar ali tornaria toda lista longa inescolhível. A captura existe para alcançar as duas —
     * o evento de rolagem não sobe pela árvore.
     */
    function handleScroll(event: Event): void {
      const target = event.target
      if (target instanceof Node && layerRef.current?.contains(target) === true) return
      // TEMPORÁRIO — diagnóstico do smoke 424, remover depois de ler o log da CI.
      const nome =
        target instanceof Element ? target.tagName : target instanceof Document ? 'document' : '?'
      console.warn(`[fl] dismiss=page-scroll target=${nome}`)
      dismissRef.current()
    }

    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', measure)
    }
  }, [isOpen, measure])

  useEffect(() => {
    if (!isOpen) return undefined
    function handlePointerDown(event: MouseEvent): void {
      const target = event.target
      if (!(target instanceof Node)) return
      if (anchorRef.current?.contains(target) === true) return
      if (layerRef.current?.contains(target) === true) return
      dismissRef.current()
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isOpen])

  return { anchorRef, layerRef, layerStyle: toStyle(position) }
}
