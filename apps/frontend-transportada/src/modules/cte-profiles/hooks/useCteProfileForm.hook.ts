/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { CTE_PROFILES_ERROR, VERSION_CONFLICT_ERROR } from '../shared/cteProfiles.constant'
import type {
  CteProfileBody,
  CteProfileDetail,
  CteProfileVersionInput,
} from '../shared/cteProfiles.types'
import {
  toFormState,
  toProfileBody,
  type ProfileFormState,
} from '../shared/cteProfilesForm.service'

type UseCteProfileFormInput = Readonly<{
  onCreate: (body: CteProfileBody) => Promise<CteProfileDetail>
  onUpdate: (input: CteProfileBody & CteProfileVersionInput) => Promise<CteProfileDetail>
  profile?: CteProfileDetail
}>

export type CteProfileFormController = Readonly<{
  feedbackKey: null | string
  isSaving: boolean
  patch: (values: Partial<ProfileFormState>) => void
  state: ProfileFormState
  submit: () => Promise<void>
}>

const FEEDBACK_BY_ERROR: Readonly<Record<string, string>> = {
  [CTE_PROFILES_ERROR.FORBIDDEN]: 'readOnly',
  [CTE_PROFILES_ERROR.INVALID_AMOUNT]: 'invalidAmount',
  [CTE_PROFILES_ERROR.INVALID_RATE]: 'invalidRate',
  [VERSION_CONFLICT_ERROR]: 'versionConflict',
}

function resolveFeedbackKey(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  return FEEDBACK_BY_ERROR[code] ?? 'saveError'
}

export function useCteProfileForm(input: UseCteProfileFormInput): CteProfileFormController {
  const [state, setState] = useState<ProfileFormState>(() => toFormState(input.profile))
  const [feedbackKey, setFeedbackKey] = useState<null | string>(null)
  const [isSaving, setIsSaving] = useState(false)
  const { onCreate, onUpdate, profile } = input

  function patch(values: Partial<ProfileFormState>): void {
    setFeedbackKey(null)
    setState((previous) => ({ ...previous, ...values }))
  }

  async function submit(): Promise<void> {
    let body: CteProfileBody
    try {
      body = toProfileBody(state)
    } catch (error) {
      setFeedbackKey(resolveFeedbackKey(error))
      return
    }

    setIsSaving(true)
    try {
      await (profile === undefined
        ? onCreate(body)
        : onUpdate({ ...body, expectedVersion: profile.version, profileId: profile.id }))
      setFeedbackKey('saved')
    } catch (error) {
      setFeedbackKey(resolveFeedbackKey(error))
    } finally {
      setIsSaving(false)
    }
  }

  return { feedbackKey, isSaving, patch, state, submit }
}
