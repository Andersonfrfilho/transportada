/* Copyright (c) 2026 Ada Technology. MIT License. */
import { DateDivider, MessageText, type MessagePayload } from '@adatechnology/conversations-ui'
import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import type { PortalClient } from '@/modules/shared/portalClient.service'
import type {
  PortalConversationAttachment,
  PortalConversationMessage,
} from '@/modules/shared/portal.types'
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
import {
  formatFileSize,
  nextPortalPlaybackRate,
  pickPortalAttachments,
  PORTAL_ATTACHMENT_ACCEPT,
  PORTAL_ATTACHMENTS_PER_MESSAGE,
  portalAttachmentKind,
} from './shared/conversationAttachment.service'

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

const RATE_FORMATTER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

/**
 * Spec 183 T705: o áudio toca pelo `<audio>` nativo, com a velocidade ao lado. O portal só ouve —
 * não grava (o `Permissions-Policy` dele fecha o microfone).
 */
function PortalAudioPlayer({ label, src }: Readonly<{ label: string; src: string }>) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [rate, setRate] = useState(1)
  /** `defaultPlaybackRate` sobrevive a um novo carregamento do `src`; `playbackRate` sozinho, não. */
  useEffect(() => {
    if (audioRef.current === null) return
    audioRef.current.defaultPlaybackRate = rate
    audioRef.current.playbackRate = rate
  }, [rate])
  const rateText = `${RATE_FORMATTER.format(rate)}×`
  return (
    <div className="conversation__audio">
      <audio aria-label={label} controls preload="metadata" ref={audioRef} src={src} />
      <button
        aria-label={`Velocidade de reprodução: ${rateText}`}
        className="secondary conversation__audio-speed"
        onClick={() => setRate(nextPortalPlaybackRate)}
        type="button"
      >
        {rateText}
      </button>
    </div>
  )
}

/**
 * Spec 183 T702b: os anexos dentro do balão. Imagem em miniatura (o bucket está no `img-src`),
 * áudio pelo `<audio>` (`media-src`) e o resto como link de download com nome e tamanho.
 */
function MessageAttachments({
  attachments,
}: Readonly<{ attachments: readonly PortalConversationAttachment[] }>) {
  if (attachments.length === 0) return null
  return (
    <ul aria-label="Anexos da mensagem" className="conversation__attachments">
      {attachments.map((attachment, index) => {
        const kind = portalAttachmentKind(attachment.contentType)
        return (
          <li key={`${attachment.url}-${index}`}>
            {kind === 'image' ? (
              <a
                className="conversation__image"
                href={attachment.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                <img alt={attachment.fileName} loading="lazy" src={attachment.url} />
              </a>
            ) : kind === 'audio' ? (
              <PortalAudioPlayer label={attachment.fileName} src={attachment.url} />
            ) : (
              <a
                className="conversation__file"
                download={attachment.fileName}
                href={attachment.url}
                rel="noopener noreferrer"
              >
                <span className="conversation__file-name">{attachment.fileName}</span>
                <span className="conversation__file-size">
                  {formatFileSize(attachment.sizeBytes)}
                </span>
              </a>
            )}
          </li>
        )
      })}
    </ul>
  )
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
 * `styles.css` do pacote não entra (regra global). O anexo chegou com a T702b; o áudio gravado, com a
 * T705 (o portal só ouve — não grava).
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
  /** Spec 183 T702b: os arquivos do rascunho, as recusas e o que já subiu dele. */
  const [files, setFiles] = useState<readonly File[]>([])
  const [fileMessages, setFileMessages] = useState<readonly string[]>([])
  const uploaded = useRef(new Map<File, string>())
  const fieldId = useId()
  const fileFieldId = useId()
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
    const validated = validateConversationDraft(draft, files.length)
    if (!validated.ok) {
      setDraftError(validated.message)
      return
    }
    setDraftError(null)
    send.mutate(
      {
        body: validated.body,
        files,
        idempotencyKey,
        ref: conversationRef,
        uploaded: uploaded.current,
      },
      {
        onSuccess: () => {
          setDraft('')
          setFiles([])
          setFileMessages([])
          uploaded.current = new Map()
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
                      {message.body === '' ? null : (
                        <MessageText message={toPayload(message, index)} />
                      )}
                      <MessageAttachments attachments={message.attachments} />
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
            <label className="panel__label" htmlFor={fileFieldId}>
              Anexos (opcional, até {PORTAL_ATTACHMENTS_PER_MESSAGE})
            </label>
            <input
              accept={PORTAL_ATTACHMENT_ACCEPT}
              disabled={send.isPending || files.length >= PORTAL_ATTACHMENTS_PER_MESSAGE}
              id={fileFieldId}
              multiple
              onChange={(event) => {
                const picked = pickPortalAttachments(files, Array.from(event.target.files ?? []))
                setFiles(picked.files)
                setFileMessages(picked.messages)
                event.target.value = ''
              }}
              type="file"
            />
            {files.length > 0 && (
              <ul aria-label="Anexos escolhidos" className="conversation__chosen">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`}>
                    <span className="conversation__file-name">{file.name}</span>
                    <span className="conversation__file-size">{formatFileSize(file.size)}</span>
                    <button
                      aria-label={`Tirar ${file.name}`}
                      className="secondary"
                      disabled={send.isPending}
                      onClick={() => {
                        setFiles(files.filter((_, position) => position !== index))
                        setFileMessages([])
                      }}
                      type="button"
                    >
                      Tirar
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {fileMessages.map((text) => (
              <p className="panel__label" key={text} role="alert">
                {text}
              </p>
            ))}
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
