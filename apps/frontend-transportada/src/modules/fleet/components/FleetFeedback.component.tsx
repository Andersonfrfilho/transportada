/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

import styles from '../styles/fleet.module.css'

type FleetFeedbackProps = Readonly<{
  children: ReactNode
  isError: boolean
}>

/** Falha é `alert` e sai em vermelho; sucesso é `status` e não interrompe o leitor de tela. */
export function FleetFeedback({ children, isError }: FleetFeedbackProps) {
  return (
    <p
      className={cn(styles.feedback, isError ? styles.feedbackError : styles.feedbackSuccess)}
      role={isError ? 'alert' : 'status'}
    >
      {children}
    </p>
  )
}
