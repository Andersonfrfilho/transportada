/* Copyright (c) 2026 Ada Technology. MIT License. */
import { lazy, Suspense, useMemo, useState } from 'react'

import type { PortalClient } from '@/modules/shared/portalClient.service'
import '@/styles/participantConversation.css'

import {
  createPortalParticipantApi,
  PORTAL_OCCURRENCE_SUBJECT_TYPE,
  PORTAL_SUBJECT_GROUPS,
} from './shared/portalParticipantApi.service'
import { conversationToggleLabel } from './shared/occurrenceConversation.service'

const ParticipantConversations = lazy(async () => {
  const module = await import('@adatechnology/conversations-ui/participant')
  return { default: module.ParticipantConversations }
})

type OccurrenceParticipantConversationProps = Readonly<{
  client: PortalClient
  conversationRef: string
  unreadCount: number
}>

/** Spec 263 T1b.4 (RF13): o portal abre a conversa com a visão do participante, só com `api` e `subjectGroups`. */
export function OccurrenceParticipantConversation({
  client,
  conversationRef,
  unreadCount,
}: OccurrenceParticipantConversationProps) {
  const [isOpen, setIsOpen] = useState(false)
  const api = useMemo(() => createPortalParticipantApi(client), [client])
  const subject = useMemo(
    () => ({ subjectId: conversationRef, subjectType: PORTAL_OCCURRENCE_SUBJECT_TYPE }),
    [conversationRef],
  )

  return (
    <section className="conversation conversation--participant">
      <button
        aria-expanded={isOpen}
        className="secondary"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        {conversationToggleLabel(isOpen ? 0 : unreadCount)}
      </button>
      {isOpen && (
        <div className="conversation__participant">
          <Suspense fallback={<div className="skeleton" />}>
            <ParticipantConversations
              api={api}
              channel="portal"
              locale="pt-BR"
              onSelect={() => undefined}
              selected={subject}
              subjectGroups={PORTAL_SUBJECT_GROUPS}
            />
          </Suspense>
        </div>
      )}
    </section>
  )
}
