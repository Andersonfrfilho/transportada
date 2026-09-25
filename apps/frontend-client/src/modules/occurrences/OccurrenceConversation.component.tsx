/* Copyright (c) 2026 Ada Technology. MIT License. */
import { DateDivider, MessageText, type MessagePayload } from '@adatechnology/conversations-ui'
import { useEffect, useId, useState } from 'react'
import type { FormEvent } from 'react'

import type { PortalClient } from '@/modules/shared/portalClient.service'
import type { PortalConversationMessage } from '@/modules/shared/portal.types'
import {
  useMarkConversationRead,
  useOccurrenceConversation,
  useSendConversationMessage,
} from './queries/occurrenceConversation.query'
import {
  conversationToggleLabel,
  createConversationIdempotencyKey,
  describePortalMessage,
  groupConversationByDay,
  validateConversationDraft,
} from './shared/occurrenceConversation.service'

const timeFormatter = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' })

function formatTime(iso: string): string {
  const moment = new Date(iso)
  return Number.isNaN(moment.getTime()) ? iso : timeFormatter.format(moment)
}

/** O `MessageText` do pacote só lê o texto; o resto do `MessagePayload` é o mínimo que ele pede. */
function toPayload(message: PortalConversationMessage, index: number): MessagePayload {
  return {
    content: message.body,
    direction: message.side === 'carrier' ? 'outbound' : 'inbound',
    id: `${message.createdAt}-${index}`,
    sender: message.side === 'carrier' ? 'agent' : 'customer',
    timestamp: message.createdAt,
    type: 'text',
  }
}

type OccurrenceConversationProps = Readonly<{
  client: PortalClient
  conversationRef: string
  unreadCount: number
}>

/**
 * Spec 183 T653 (RF21, D9, ADR-0073): a conversa com a transportadora no cartão da ocorrência, ao
 * lado da decisão — que continua sendo o formulário da 164. Fechada por padrão; abrir lê o fio e
 * marca como lida. O balão é nosso (tokens copiados do painel), com as peças do pacote dentro; o
 * `styles.css` do pacote não entra (regra global). Anexo e áudio chegam com a T702/T705.
 */
export function OccurrenceConversation({
  client,
  conversationRef,
  unreadCount,
}: OccurrenceConversationProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [draftError, setDraftError] = useState<string | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState(createConversationIdempotencyKey)
  const fieldId = useId()
  const conversation = useOccurrenceConversation(client, {
    enabled: isOpen,
    ref: conversationRef,
  })
  const markRead = useMarkConversationRead(client)
  const send = useSendConversationMessage(client)
  const { mutate: markAsRead } = markRead
  const pendingUnread = conversation.data?.unreadCount ?? unreadCount

  useEffect(() => {
    if (isOpen && pendingUnread > 0) markAsRead(conversationRef)
  }, [conversationRef, isOpen, markAsRead, pendingUnread])

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const validated = validateConversationDraft(draft)
    if (!validated.ok) {
      setDraftError(validated.message)
      return
    }
    setDraftError(null)
    send.mutate(
      { body: validated.body, idempotencyKey, ref: conversationRef },
      {
        onSuccess: () => {
          setDraft('')
          setIdempotencyKey(createConversationIdempotencyKey())
        },
      },
    )
  }

  const messages = conversation.data?.messages ?? []

  return (
    <section className="conversation">
      <button
        aria-expanded={isOpen}
        className="secondary"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        {conversationToggleLabel(isOpen ? 0 : unreadCount)}
      </button>
      {isOpen && (
        <div className="conversation__body">
          {conversation.isLoading && <div className="skeleton" />}
          {conversation.error !== null && (
            <p className="panel__label">Não foi possível carregar a conversa agora.</p>
          )}
          {conversation.data !== undefined && messages.length === 0 && (
            <p className="panel__label">Nenhuma mensagem ainda. Escreva para a transportadora.</p>
          )}
          {groupConversationByDay(messages).map((group) => (
            <div className="conversation__day" key={group.day}>
              <DateDivider
                classNames={{ label: 'conversation__day-label', root: 'conversation__day-divider' }}
                iso={group.messages[0]?.createdAt ?? group.day}
              />
              {group.messages.map((message, index) => {
                const view = describePortalMessage(message)
                return (
                  <div
                    className={`conversation__row conversation__row--${view.align}`}
                    key={`${message.createdAt}-${index}`}
                  >
                    <article className={`conversation__bubble conversation__bubble--${view.tone}`}>
                      <p className="conversation__author">{view.author}</p>
                      <MessageText message={toPayload(message, index)} />
                      <p className="conversation__meta">
                        <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>{' '}
                        {view.channel}
                      </p>
                    </article>
                  </div>
                )
              })}
            </div>
          ))}
          <form className="conversation__form" noValidate onSubmit={submit}>
            <label className="panel__label" htmlFor={fieldId}>
              Mensagem para a transportadora
            </label>
            <textarea
              id={fieldId}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              value={draft}
            />
            {draftError !== null && <p className="panel__label">{draftError}</p>}
            {send.isError && (
              <p className="panel__label">Não foi possível enviar agora. Tente de novo.</p>
            )}
            <button disabled={send.isPending} type="submit">
              {send.isPending ? 'Enviando…' : 'Enviar mensagem'}
            </button>
          </form>
        </div>
      )}
    </section>
  )
}
