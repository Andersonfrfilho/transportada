/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import {
  describeBusinessCalendarRefusal,
  type BusinessCalendarRefusal,
} from '../shared/businessCalendarRefusal.service'
import type { HolidayNotice } from '../shared/businessCalendarSubmit.service'

type Feedback = Readonly<{
  notices: readonly HolidayNotice[]
  refusal: BusinessCalendarRefusal | undefined
}>

const NO_FEEDBACK: Feedback = { notices: [], refusal: undefined }

/**
 * O que a última ação disse: ou a recusa (com os campos e o motivo), ou os avisos do que aconteceu. Nunca os dois, e
 * nunca nenhum depois de uma ação — "mudez" é o defeito que `web.md` §11 proíbe.
 */
export function useHolidayFeedback() {
  const [feedback, setFeedback] = useState<Feedback>(NO_FEEDBACK)

  return {
    clear: () => setFeedback(NO_FEEDBACK),
    notices: feedback.notices,
    notify: (notices: readonly HolidayNotice[]) => setFeedback({ notices, refusal: undefined }),
    refuse: (error: unknown) =>
      setFeedback({ notices: [], refusal: describeBusinessCalendarRefusal(error) }),
    refusal: feedback.refusal,
  }
}

export type HolidayFeedbackController = ReturnType<typeof useHolidayFeedback>
