/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'

import {
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
    const next = resolveFloatingLayerPosition({
      ...(align === undefined ? {} : { align }),
      anchor: {
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      },
      layer: { height: layer.scrollHeight, width: layer.offsetWidth },
      viewport: { height: window.innerHeight, width: window.innerWidth },
    })

    setPosition((current) => (current !== null && samePosition(current, next) ? current : next))
  }, [align])

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null)
      return undefined
    }
    measure()
    // Captura porque o gatilho pode rolar dentro de um painel, não só da janela.
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
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
