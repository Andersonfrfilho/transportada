/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useSyncExternalStore } from 'react'

import { useDriverSession } from '@/modules/driver-trip/hooks/useDriverSession.hook'
import { navigateToDriverConversation } from '@/modules/shared/driverRoute.service'

import { conversationDigestsQueryOptions } from '../shared/conversationDigests.query'
import { UNREAD_CONVERSATIONS_QUERY_KEY } from '../shared/driverConversation.constant'
import { getDriverConversationsApi } from '../shared/driverConversationsApiInstance.service'
import {
  resolveOpenAction,
  runOpenSubject,
  type OpenAction,
  type OpenableSubject,
  type OpenErrorKey,
} from '../shared/openSubjectConversation.service'
import { useIsOnline } from './useIsOnline.hook'

export type OpenSubjectConversationState = Readonly<{
  action: OpenAction
  errorKey: OpenErrorKey | undefined
  handleOpen: () => Promise<void>
}>

/** Liga o botão ao adapter, à lista leve da aba (sem outro polling) e à rota do app. */
export function useOpenSubjectConversation(subject: OpenableSubject): OpenSubjectConversationState {
  const { canSync } = useDriverSession()
  const queryClient = useQueryClient()
  const api = getDriverConversationsApi()
  const isOnline = useIsOnline()
  const isUnavailable = useSyncExternalStore(
    api.openAvailability.subscribe,
    api.openAvailability.isUnavailable,
    () => false,
  )
  const [isOpening, setIsOpening] = useState(false)
  const [errorKey, setErrorKey] = useState<OpenErrorKey | undefined>(undefined)
  const { data: conversation } = useQuery({
    ...conversationDigestsQueryOptions(canSync),
    select: (digests) =>
      digests.find(
        (digest) =>
          digest.subjectType === subject.subjectType && digest.subjectId === subject.subjectId,
      ),
  })
  const action = resolveOpenAction({ conversation, isOnline, isOpening, isUnavailable })

  async function handleOpen(): Promise<void> {
    if (action.kind === 'opening' || action.kind === 'offline' || action.kind === 'hidden') return
    setErrorKey(undefined)
    setIsOpening(true)
    const outcome = await runOpenSubject({
      navigate: navigateToDriverConversation,
      openConversation: (target) => api.openConversation(target),
      shouldRequestServer: action.shouldRequestServer,
      subject,
    })
    setIsOpening(false)
    if (outcome.status === 'failed') setErrorKey(outcome.errorKey)
    await queryClient.invalidateQueries({ queryKey: UNREAD_CONVERSATIONS_QUERY_KEY })
  }

  return { action, errorKey, handleOpen }
}
