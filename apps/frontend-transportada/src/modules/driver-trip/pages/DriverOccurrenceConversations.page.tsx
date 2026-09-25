/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import {
  useDriverConversationMessagesQuery,
  useDriverConversationsQuery,
  useMarkDriverConversationReadMutation,
  useReplyDriverConversationMutation,
} from '@/modules/occurrence-conversation/queries/driverConversation.query'
import { ConversationAttachmentPicker } from '@/modules/occurrence-conversation/components/ConversationAttachmentPicker.component'
import { ConversationAttachments } from '@/modules/occurrence-conversation/components/ConversationAttachments.component'
import type { DriverConversationSummary } from '@/modules/occurrence-conversation/shared/driverConversationClient.service'
import {
  countNewIncomingMessages,
  createDriverMessageIdempotencyKey,
  OCCURRENCE_CONVERSATION_BODY_MAX_LENGTH,
  validateDriverMessageDraft,
} from '@/modules/occurrence-conversation/shared/occurrenceConversation.service'
import conversationStyles from '@/modules/occurrence-conversation/styles/occurrenceConversation.module.css'

import styles from '../styles/driverTrip.module.css'

const momentFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

function formatMoment(iso: string): string {
  const moment = new Date(iso)
  return Number.isNaN(moment.getTime()) ? iso : momentFormatter.format(moment)
}

/**
 * Spec 183 T604 (RF11, RF14): a conversa de uma ocorrência no app do motorista. Abrir marca lida
 * as mensagens da operação; responder leva uma chave por mensagem escrita.
 */
function DriverConversation({
  conversation,
  onBack,
}: Readonly<{ conversation: DriverConversationSummary; onBack: () => void }>) {
  const { t } = useTranslation('occurrenceConversation')
  const messages = useDriverConversationMessagesQuery(conversation.occurrenceId)
  const [announcement, setAnnouncement] = useState('')
  const previousIds = useRef<null | readonly string[]>(null)
  /**
   * Spec 183 T902 (D2): para o motorista, "recebida" é a da operação (`outbound`). A leitura que a
   * traz é anunciada; a primeira, não.
   */
  const loaded = messages.data
  useEffect(() => {
    if (loaded === undefined) return
    const count = countNewIncomingMessages(
      previousIds.current,
      loaded.map((message) => ({
        direction: message.direction === 'outbound' ? 'inbound' : 'outbound',
        id: message.id,
      })),
    )
    previousIds.current = loaded.map((message) => message.id)
    if (count > 0) setAnnouncement(t('thread.newMessages', { count }))
  }, [loaded, t])
  const { mutate: markRead } = useMarkDriverConversationReadMutation()
  const reply = useReplyDriverConversationMutation(conversation.occurrenceId)
  const [draft, setDraft] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    createDriverMessageIdempotencyKey(() => crypto.randomUUID()),
  )
  const [error, setError] = useState<'required' | 'tooLong' | null>(null)
  /** Spec 183 T702b: a foto ou o documento da resposta, e o que já subiu deste rascunho. */
  const [files, setFiles] = useState<readonly File[]>([])
  const uploaded = useRef(new Map<File, string>())

  useEffect(() => {
    markRead(conversation.occurrenceId)
  }, [conversation.occurrenceId, markRead])

  function submit(): void {
    const validated = validateDriverMessageDraft(draft, files.length)
    if ('error' in validated) {
      setError(validated.error)
      return
    }
    setError(null)
    reply.mutate(
      { body: validated.body, files, idempotencyKey, uploaded: uploaded.current },
      {
        onSuccess: () => {
          setDraft('')
          setFiles([])
          uploaded.current = new Map()
          setIdempotencyKey(createDriverMessageIdempotencyKey(() => crypto.randomUUID()))
          void messages.refetch()
        },
      },
    )
  }

  return (
    <main className={styles.shell}>
      <header className={styles.eventQueueHeader}>
        <Button type="button" variant="secondary" onClick={onBack}>
          {t('driverApp.back')}
        </Button>
        <h1 className={styles.eventQueueTitle}>
          {t('driverApp.conversationTitle', { label: conversation.occurrenceLabel })}
        </h1>
      </header>

      {messages.isLoading ? (
        <SkeletonGroup label={t('driverApp.loading')}>
          <Skeleton height="4rem" width="100%" />
        </SkeletonGroup>
      ) : (
        <div className={conversationStyles.thread}>
          <p aria-live="polite" className={conversationStyles.srOnly}>
            {announcement}
          </p>
          {(messages.data ?? []).map((message) => {
            const isMine = message.direction === 'inbound'
            return (
              <div
                className={
                  isMine
                    ? `${conversationStyles.row} ${conversationStyles.rowMine}`
                    : conversationStyles.row
                }
                key={message.id}
              >
                <article
                  className={`${conversationStyles.bubble} ${
                    isMine ? conversationStyles.bubbleDriver : conversationStyles.bubbleOutbound
                  }`}
                >
                  <header className={conversationStyles.author}>
                    <span>
                      {isMine ? t('driverApp.me') : (message.authorName ?? t('author.operation'))}
                    </span>
                  </header>
                  {message.bodyText === '' ? null : (
                    <p className={conversationStyles.body}>{message.bodyText}</p>
                  )}
                  <ConversationAttachments attachments={message.attachments} />
                  <footer className={conversationStyles.meta}>
                    <time dateTime={message.createdAt}>{formatMoment(message.createdAt)}</time>
                  </footer>
                </article>
              </div>
            )
          })}
        </div>
      )}

      <form
        className={conversationStyles.panel}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <label className={conversationStyles.field}>
          <span>{t('driverApp.reply')}</span>
          <textarea
            disabled={reply.isPending}
            maxLength={OCCURRENCE_CONVERSATION_BODY_MAX_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            value={draft}
          />
          {error === null ? null : (
            <span className={conversationStyles.error}>{t(`driver.error.${error}`)}</span>
          )}
        </label>
        <ConversationAttachmentPicker
          allowRecording
          channel="app"
          disabled={reply.isPending}
          files={files}
          onChange={setFiles}
        />
        {reply.isError ? (
          <p className={conversationStyles.error} role="alert">
            {t('driverApp.error')}
          </p>
        ) : null}
        <Button disabled={reply.isPending} type="submit">
          {reply.isPending ? t('driver.sending') : t('driverApp.send')}
        </Button>
      </form>
    </main>
  )
}

/**
 * Spec 183 T604 (RF11): as conversas da operação com o motorista, a mais recente primeiro, com as
 * mensagens ainda não abertas. Baixar a lista registra "entregue" (RF14).
 */
export function DriverOccurrenceConversationsPage({ onBack }: Readonly<{ onBack: () => void }>) {
  const { t } = useTranslation('occurrenceConversation')
  const conversations = useDriverConversationsQuery({ enabled: true })
  const [openId, setOpenId] = useState<null | string>(null)
  const open = conversations.data?.find((conversation) => conversation.occurrenceId === openId)

  if (open !== undefined) {
    return <DriverConversation conversation={open} onBack={() => setOpenId(null)} />
  }

  return (
    <main className={styles.shell}>
      <header className={styles.eventQueueHeader}>
        <Button type="button" variant="secondary" onClick={onBack}>
          {t('driverApp.back')}
        </Button>
        <h1 className={styles.eventQueueTitle}>{t('driverApp.title')}</h1>
      </header>
      {conversations.isLoading ? (
        <SkeletonGroup label={t('driverApp.loading')}>
          <Skeleton height="3rem" width="100%" />
        </SkeletonGroup>
      ) : (conversations.data ?? []).length === 0 ? (
        <p className={styles.profileMeta} role="status">
          {t('driverApp.empty')}
        </p>
      ) : (
        <ul className={styles.documentList}>
          {(conversations.data ?? []).map((conversation) => (
            <li key={conversation.occurrenceId}>
              <button
                className={styles.queueBannerButton}
                onClick={() => setOpenId(conversation.occurrenceId)}
                type="button"
              >
                {conversation.unreadCount > 0
                  ? t('driverApp.itemUnread', {
                      count: conversation.unreadCount,
                      label: conversation.occurrenceLabel,
                    })
                  : t('driverApp.item', {
                      at: formatMoment(conversation.lastMessageAt),
                      label: conversation.occurrenceLabel,
                    })}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
