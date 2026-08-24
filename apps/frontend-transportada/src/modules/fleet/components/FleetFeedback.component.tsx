import { useEffect, useRef, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

import styles from '../styles/fleet.module.css'

type FleetFeedbackProps = Readonly<{
  children: ReactNode
  isError: boolean
  /** Falso quando outro dono já levou a tela até o erro — o 409 ancorado no campo, por exemplo. */
  reveal?: boolean
}>

/** Falha é `alert` e sai em vermelho; sucesso é `status` e não interrompe o leitor de tela. */
export function FleetFeedback({ children, isError, reveal = true }: FleetFeedbackProps) {
  const elementRef = useRef<HTMLParagraphElement | null>(null)

  /**
   * A falha vai até quem clicou. Numa ficha longa o aviso nasce no fim do formulário, e quem
   * gravou de um campo do meio não vê linha nenhuma mudar: a gravação falhada é indistinguível
   * da que deu certo. Sucesso não rola — ali nada precisa ser corrigido.
   */
  useEffect(() => {
    if (!isError || !reveal) return
    elementRef.current?.scrollIntoView({ block: 'center' })
  }, [children, isError, reveal])

  return (
    <p
      className={cn(styles.feedback, isError ? styles.feedbackError : styles.feedbackSuccess)}
      ref={elementRef}
      role={isError ? 'alert' : 'status'}
    >
      {children}
    </p>
  )
}
