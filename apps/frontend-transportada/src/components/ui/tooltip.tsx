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

const DISMISSING_KEYS = ['ArrowDown', 'ArrowUp', 'Enter', ' ']

type TooltipProps = Readonly<{
  /** O elemento que hospeda a dica — botão, ícone, célula. */
  children: ReactNode
  /**
   * Ativar o gatilho (clique, Enter, Espaço, setas) dispensa a dica. Só o `Select` pede: a lista
   * dele nasce sob a dica e ficaria coberta. Os gatilhos só-dica mantêm a dica aberta ao ativar.
   */
  dismissOnActivate?: boolean
  /** O filho é um campo que deve ocupar a largura do item de grade (Select). Botão de ícone não pede. */
  fill?: boolean
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
export function Tooltip({
  children,
  dismissOnActivate = false,
  fill = false,
  label,
}: TooltipProps): JSX.Element {
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
        className={fill ? styles.triggerFill : styles.trigger}
        onBlur={close}
        /**
         * Um seletor que abre a lista por baixo da dica fica com as opções cobertas (a dica pinta
         * por cima, com `z-index` maior). Ele abre no `keydown` de Enter, Espaço e setas e cancela
         * o clique do teclado, então as teclas fecham a dica aqui.
         */
        onClick={dismissOnActivate ? close : undefined}
        /** Foco de teclado abre **na hora**: quem chegou por Tab escolheu parar aqui. */
        onFocus={(event) => {
          /** O painel do `Select` vive em portal, mas o foco dele sobe pela árvore do React: sem este filtro a dica reabria por cima das opções. */
          if (anchorRef.current?.contains(event.target) === true) setIsOpen(true)
        }}
        onKeyDown={(event) => {
          if (dismissOnActivate && DISMISSING_KEYS.includes(event.key)) close()
        }}
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
