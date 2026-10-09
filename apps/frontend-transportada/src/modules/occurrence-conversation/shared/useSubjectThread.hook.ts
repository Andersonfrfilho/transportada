/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo } from 'react'

import { useComposerQuickRepliesQuery } from '../queries/quickReplies.query'
import { toThreadQuickReplies } from './quickReplies.service'
import type { SubjectConversationRef } from './subjectConversation.types'
import { getSubjectConversationClient } from './subjectConversationClient.provider'
import { createSubjectThreadApi } from './subjectThreadApi.service'

/** O que o `ConversationThread` pede estável: o adaptador, o assunto e os chips só mudam com o assunto. */
export function useSubjectThread({ subjectId, subjectType, tripId }: SubjectConversationRef) {
  const quickReplies = useComposerQuickRepliesQuery('driver')
  const api = useMemo(
    () =>
      createSubjectThreadApi({
        client: getSubjectConversationClient(),
        subject: { subjectId, subjectType, tripId },
      }),
    [subjectId, subjectType, tripId],
  )
  const threadSubject = useMemo(() => ({ subjectId, subjectType }), [subjectId, subjectType])
  const threadQuickReplies = useMemo(
    () => toThreadQuickReplies(quickReplies.data ?? []),
    [quickReplies.data],
  )
  return { api, threadQuickReplies, threadSubject }
}
