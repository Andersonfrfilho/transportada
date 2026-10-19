/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useSyncExternalStore } from 'react'

import { playConversationChime, shouldChime, titleWithUnread } from './conversationAlert.service'

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}

function useDocumentHidden(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === 'hidden',
    () => false,
  )
}

export type ConversationAlertInput = Readonly<{
  /** A conversa está à vista (coluna expandida ou aba selecionada)? */
  isOpen: boolean
  unread: number
}>

/**
 * Mensagem nova numa conversa que o operador não vê toca um som, e a aba do navegador mostra "(n)" com o que
 * ficou sem ler. Página em segundo plano conta como "não vista", mesmo com a conversa expandida.
 */
export function useConversationAlerts(conversations: readonly ConversationAlertInput[]): void {
  const hidden = useDocumentHidden()
  const previous = useRef<number[] | null>(null)
  const unreadList = conversations.map((conversation) => conversation.unread)

  useEffect(() => {
    const before = previous.current
    previous.current = unreadList
    // a primeira leitura é o que já estava na ocorrência, não mensagem nova
    if (before === null) return
    const arrived = conversations.some((conversation, index) =>
      shouldChime({
        isOpen: conversation.isOpen && !hidden,
        next: conversation.unread,
        previous: before[index] ?? 0,
      }),
    )
    if (arrived) playConversationChime()
  }, [unreadList.join(','), conversations.map((c) => c.isOpen).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const unseen = conversations.reduce(
    (total, conversation) => total + (conversation.isOpen && !hidden ? 0 : conversation.unread),
    0,
  )
  useEffect(() => {
    document.title = titleWithUnread(document.title, unseen)
    return () => {
      document.title = titleWithUnread(document.title, 0)
    }
  }, [unseen])
}
