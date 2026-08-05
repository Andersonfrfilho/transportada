/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type {
  BootstrapAdministratorInput,
  BootstrapFirstAdminResult,
} from '../shared/bootstrap.types'

export type BootstrapFormState = Readonly<{
  email: string
  firstName: string
  lastName: string
  password: string
  token: string
  username: string
}>

type UseBootstrapFirstAdminInput = Readonly<{
  createFirstAdmin: (
    input: Readonly<{ administrator: BootstrapAdministratorInput; token: string }>,
  ) => Promise<BootstrapFirstAdminResult>
  onSuccess: (result: BootstrapFirstAdminResult) => void
}>

export type BootstrapFirstAdminController = Readonly<{
  feedbackKey: 'saveError' | null
  isSubmitting: boolean
  patch: (values: Partial<BootstrapFormState>) => void
  state: BootstrapFormState
  submit: () => Promise<void>
}>

function createEmptyState(): BootstrapFormState {
  return { email: '', firstName: '', lastName: '', password: '', token: '', username: '' }
}

export function useBootstrapFirstAdmin(
  input: UseBootstrapFirstAdminInput,
): BootstrapFirstAdminController {
  const [state, setState] = useState<BootstrapFormState>(createEmptyState)
  const [feedbackKey, setFeedbackKey] = useState<'saveError' | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { createFirstAdmin, onSuccess } = input

  function patch(values: Partial<BootstrapFormState>): void {
    setFeedbackKey(null)
    setState((previous) => ({ ...previous, ...values }))
  }

  async function submit(): Promise<void> {
    setIsSubmitting(true)
    try {
      const result = await createFirstAdmin({
        administrator: {
          email: state.email,
          firstName: state.firstName,
          lastName: state.lastName,
          password: state.password,
          username: state.username,
        },
        token: state.token,
      })
      onSuccess(result)
    } catch {
      setFeedbackKey('saveError')
    } finally {
      setIsSubmitting(false)
    }
  }

  return { feedbackKey, isSubmitting, patch, state, submit }
}
