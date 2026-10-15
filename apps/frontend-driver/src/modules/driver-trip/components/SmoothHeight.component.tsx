/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, type ReactNode } from 'react'

import { watchSmoothHeight } from '../shared/smoothHeight.service'

type SmoothHeightProps = Readonly<{
  children: ReactNode
  /** A classe do miolo (o layout que já existia): a caixa de fora é só a que anima a altura. */
  className?: string | undefined
}>

/** A altura do que está dentro muda com suavidade (`watchSmoothHeight`). */
export function SmoothHeight({ children, className }: SmoothHeightProps) {
  const outerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const outer = outerRef.current
    const content = contentRef.current
    if (outer === null || content === null || typeof ResizeObserver === 'undefined') {
      return undefined
    }
    return watchSmoothHeight({
      content,
      createObserver: (onResize) => new ResizeObserver(onResize),
      isReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      outer,
    })
  }, [])

  return (
    <div ref={outerRef}>
      <div className={className} ref={contentRef}>
        {children}
      </div>
    </div>
  )
}
