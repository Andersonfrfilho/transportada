/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { PasswordResetClient } from '../shared/passwordResetClient.service'

export type PasswordResetStep = 'code' | 'done' | 'username'

export type PasswordResetFormState = Readonly<{
  code: string
  password: string
  username: string
}>

type UsePasswordResetInput = Readonly<{
  client: PasswordResetClient
}>

export type PasswordResetController = Readonly<{
  confirm: () => Promise<void>
  feedbackKey: 'resetRejected' | null
  isSubmitting: boolean
  patch: (values: Partial<PasswordResetFormState>) => void
  requestCode: () => Promise<void>
  state: PasswordResetFormState
  step: PasswordResetStep
}>

function createEmptyState(): PasswordResetFormState {
  return { code: '', password: '', username: '' }
}

export function usePasswordReset(input: UsePasswordResetInput): PasswordResetController {
  const [state, setState] = useState<PasswordResetFormState>(createEmptyState)
  const [step, setStep] = useState<PasswordResetStep>('username')
  const [feedbackKey, setFeedbackKey] = useState<'resetRejected' | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { client } = input

  function patch(values: Partial<PasswordResetFormState>): void {
    setFeedbackKey(null)
    setState((previous) => ({ ...previous, ...values }))
  }

  /** Sempre avança: distinguir login existente de inexistente aqui seria enumerar usuários. */
  async function requestCode(): Promise<void> {
    setIsSubmitting(true)
    try {
      await client.request({ username: state.username })
      setStep('code')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function confirm(): Promise<void> {
    setIsSubmitting(true)
    try {
      await client.confirm({ code: state.code, password: state.password })
      setState(createEmptyState)
      setStep('done')
    } catch {
      setFeedbackKey('resetRejected')
    } finally {
      setIsSubmitting(false)
    }
  }

  return { confirm, feedbackKey, isSubmitting, patch, requestCode, state, step }
}
