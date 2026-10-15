/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, type ReactNode } from 'react'

import styles from '../styles/smoothHeight.module.css'

type SmoothHeightProps = Readonly<{
  children: ReactNode
  /** Vai para o miolo medido: o layout do conteúdo (grade, espaçamento) continua sendo dele. */
  className?: string | undefined
}>

/**
 * Pedido do usuário (14/10): o bloco cresce e encolhe com transição quando entra a miniatura, o
 * "enviado" ou um aviso — em vez de empurrar o resto da tela de uma vez.
 */
export function SmoothHeight({ children, className }: SmoothHeightProps) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (outer === null || inner === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      outer.style.setProperty('--smooth-height', `${inner.offsetHeight}px`)
    })
    observer.observe(inner)
    return () => observer.disconnect()
  }, [])

  return (
    <div className={styles.smoothHeight} ref={outerRef}>
      <div className={className} ref={innerRef}>
        {children}
      </div>
    </div>
  )
}
