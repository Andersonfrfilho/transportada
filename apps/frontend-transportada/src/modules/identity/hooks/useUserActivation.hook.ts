/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { UserActivationClient } from '../shared/userActivationClient.service'
import { readActivationCodeFromHash } from '../shared/userActivationClient.service'

export type UserActivationFeedbackKey = 'activationPasswordMismatch' | 'activationRejected'

export type UserActivationFormState = Readonly<{
  code: string
  confirmation: string
  password: string
}>

export type UserActivationController = Readonly<{
  activate: () => Promise<void>
  feedbackKey: null | UserActivationFeedbackKey
  hasCodeFromLink: boolean
  isDone: boolean
  isSubmitting: boolean
  patch: (values: Partial<UserActivationFormState>) => void
  state: UserActivationFormState
}>

/**
 * Lê o código do link uma vez e o tira da barra de endereço: o fragmento não vai a servidor nenhum,
 * mas ficaria no histórico e em qualquer print da tela.
 */
function takeCodeFromLink(): string {
  const code = readActivationCodeFromHash(window.location.hash)
  if (code !== '') {
    window.history.replaceState(null, '', window.location.pathname)
  }
  return code
}

export function useUserActivation(
  input: Readonly<{ client: UserActivationClient }>,
): UserActivationController {
  const [codeFromLink] = useState(takeCodeFromLink)
  const [state, setState] = useState<UserActivationFormState>({
    code: codeFromLink,
    confirmation: '',
    password: '',
  })
  const [feedbackKey, setFeedbackKey] = useState<null | UserActivationFeedbackKey>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDone, setIsDone] = useState(false)

  function patch(values: Partial<UserActivationFormState>): void {
    setFeedbackKey(null)
    setState((previous) => ({ ...previous, ...values }))
  }

  async function activate(): Promise<void> {
    if (state.password !== state.confirmation) {
      setFeedbackKey('activationPasswordMismatch')
      return
    }
    setIsSubmitting(true)
    try {
      await input.client.activate({ code: state.code.trim(), password: state.password })
      setState({ code: '', confirmation: '', password: '' })
      setIsDone(true)
    } catch {
      setFeedbackKey('activationRejected')
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    activate,
    feedbackKey,
    hasCodeFromLink: codeFromLink !== '',
    isDone,
    isSubmitting,
    patch,
    state,
  }
}
