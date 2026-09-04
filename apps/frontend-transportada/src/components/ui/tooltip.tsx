/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useId, useRef, useState, type JSX, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useFloatingLayer } from './useFloatingLayer.hook'
import styles from './tooltip.module.css'

/**
 * ⚠️ O atraso existe para a dica **não** aparecer em quem só atravessa a fileira com o mouse a
 * caminho de outra coisa. Ele é curto de propósito: o `title` nativo espera cerca de um segundo, e
 * foi por isso que ele deixou de servir — nesse tempo quem passou o mouse já concluiu que não há
 * dica nenhuma.
 */
export const TOOLTIP_OPEN_DELAY_MS = 150

type TooltipProps = Readonly<{
  /** O elemento que hospeda a dica — botão, ícone, célula. */
  children: ReactNode
  /** O texto da dica. Vazio desliga o tooltip, e o gatilho segue renderizando normalmente. */
  label: string
}>

/**
 * A dica que aparece ao lado do que se aponta.
 *
 * ⚠️ Ela **não** substitui o `aria-label` de botão só de ícone: quem lê por leitor de tela precisa
 * do nome da ação no próprio botão, não numa camada que só existe sob o ponteiro. O tooltip entra
 * como `aria-describedby`, que é descrição, e é isso que ele é.
 *
 * O teclado abre a dica no `focus`, e não só no `hover`: uma dica que só existe para quem tem mouse
 * é informação que some para quem navega por Tab.
 */
export function Tooltip({ children, label }: TooltipProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const describedById = useId()
  const { anchorRef, layerRef, layerStyle } = useFloatingLayer<HTMLDivElement>({
    isOpen,
    onDismiss: () => setIsOpen(false),
  })

  function cancelPendingOpen(): void {
    if (timerRef.current === null) return
    clearTimeout(timerRef.current)
    timerRef.current = null
  }

  /** Sair da tela com o temporizador armado abriria a dica de um gatilho que já não existe. */
  useEffect(() => cancelPendingOpen, [])

  function open(): void {
    cancelPendingOpen()
    timerRef.current = setTimeout(() => setIsOpen(true), TOOLTIP_OPEN_DELAY_MS)
  }

  function close(): void {
    cancelPendingOpen()
    setIsOpen(false)
  }

  if (label === '') return <>{children}</>

  return (
    <>
      <div
        aria-describedby={isOpen ? describedById : undefined}
        className={styles.trigger}
        onBlur={close}
        /** Foco de teclado abre **na hora**: quem chegou por Tab escolheu parar aqui. */
        onFocus={() => setIsOpen(true)}
        onMouseEnter={open}
        onMouseLeave={close}
        ref={anchorRef}
      >
        {children}
      </div>
      {isOpen
        ? createPortal(
            <div className={styles.layer} id={describedById} ref={layerRef} style={layerStyle}>
              {label}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
