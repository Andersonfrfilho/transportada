/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { TRIP_OCCURRENCE_FEED_QUERY_KEY } from '@/modules/trip/queries/tripOccurrenceFeed.query'

import {
  CONVERSATION_STATUS_REFETCH_MS,
  fetchOccurrenceConversations,
  getOccurrenceConversationClient,
  OCCURRENCE_CONVERSATIONS_QUERY_KEY,
} from '../queries/occurrenceConversation.query'
import { useComposerQuickRepliesQuery } from '../queries/quickReplies.query'
import {
  createOccurrenceThreadApi,
  type OccurrenceThreadAuthorLabels,
  type OccurrenceThreadParticipant,
} from './occurrenceThreadApi.service'
import type { ConversationParticipant } from './conversationParticipant.constant'
import { toThreadQuickReplies } from './quickReplies.service'
import { createRefreshSubscription } from './subjectThreadApi.service'

type UseOccurrenceThreadInput = Readonly<{
  companyId?: string
  occurrenceId: string
  participant: OccurrenceThreadParticipant
}>

/** O que o `ConversationThread` pede estável: o adaptador e o assunto só mudam com a ocorrência e a aba. */
export function useOccurrenceThread({
  companyId,
  occurrenceId,
  participant,
}: UseOccurrenceThreadInput) {
  const { t } = useTranslation('occurrenceConversation')
  const queryClient = useQueryClient()
  const quickReplies = useComposerQuickRepliesQuery(participant)
  const threadSubject = useMemo(
    () => ({ subjectId: `${occurrenceId}:${participant}`, subjectType: 'trip_occurrence' }),
    [occurrenceId, participant],
  )
  const labels = useMemo<OccurrenceThreadAuthorLabels>(
    () => ({
      automatic: t('author.automatic'),
      channel: {
        app: t('thread.via', { channel: t('channel.app') }),
        email: t('thread.via', { channel: t('channel.email') }),
        portal: t('thread.via', { channel: t('channel.portal') }),
        whatsapp: t('thread.via', { channel: t('channel.whatsapp') }),
      },
      contractor: t('participant.contractor'),
      contractorUser: t('author.contractorUser'),
      driver: t('author.driver'),
      operation: t('author.operation'),
      unverified: t('author.unverified'),
    }),
    [t],
  )
  /** Quem fala em cada nome de autor lido, para o avatar do balão (ícone + cor). */
  const speakers = useRef(new Map<string, ConversationParticipant>())
  const speakerOf = useCallback(
    (authorName: null | string): ConversationParticipant =>
      (authorName === null ? undefined : speakers.current.get(authorName)) ?? participant,
    [participant],
  )
  const api = useMemo(
    () =>
      createOccurrenceThreadApi({
        client: getOccurrenceConversationClient(),
        labels,
        occurrenceId,
        onChanged: () => {
          void queryClient.invalidateQueries({ queryKey: [OCCURRENCE_CONVERSATIONS_QUERY_KEY] })
          void queryClient.invalidateQueries({ queryKey: [TRIP_OCCURRENCE_FEED_QUERY_KEY] })
        },
        onSpeaker: (authorName, speaker) => speakers.current.set(authorName, speaker),
        participant,
        readConversations: () =>
          fetchOccurrenceConversations(queryClient, {
            ...(companyId === undefined ? {} : { companyId }),
            occurrenceId,
          }),
        subscribe: createRefreshSubscription(threadSubject, CONVERSATION_STATUS_REFETCH_MS),
      }),
    [companyId, labels, occurrenceId, participant, queryClient, threadSubject],
  )
  const threadQuickReplies = useMemo(
    () => toThreadQuickReplies(quickReplies.data ?? []),
    [quickReplies.data],
  )
  return { api, speakerOf, threadQuickReplies, threadSubject }
}
