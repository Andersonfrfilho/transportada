/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { TripDocumentLinkDraft, TripDocumentLinkMode } from '../shared/tripForm.service'

const EMPTY_LINK_DRAFT: TripDocumentLinkDraft = { mode: 'nfe', value: '' }

export type TripDocumentLinkFormController = ReturnType<typeof useTripDocumentLinkForm>

export function useTripDocumentLinkForm() {
  const [draft, setDraft] = useState<TripDocumentLinkDraft>(EMPTY_LINK_DRAFT)

  return {
    draft,
    reset: () => setDraft(EMPTY_LINK_DRAFT),
    setMode: (mode: TripDocumentLinkMode) => setDraft((current) => ({ ...current, mode })),
    setValue: (value: string) => setDraft((current) => ({ ...current, value })),
  }
}
