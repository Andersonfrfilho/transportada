/* Copyright (c) 2026 Ada Technology. MIT License. */
import { MessageText, StatusTicks, type MessagePayload } from '@adatechnology/conversations-ui'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { formatContractorContactPhone } from '@/modules/delivery-clients/shared/contractorContacts.validation'

import { Icon } from '@/components/ui/icon'

import { describeMessageStatus } from '../shared/messageStatus.service'
import { describeConversationMessage } from '../shared/occurrenceConversation.service'
import type {
  OccurrenceConversationAttachment,
  OccurrenceConversationChannel,
  ContractorSenderSuggestion,
  OccurrenceConversationMessage,
} from '../shared/occurrenceConversation.types'
import styles from '../styles/occurrenceConversation.module.css'
import { ConversationAttachments } from './ConversationAttachments.component'

const timeFormatter = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' })
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

function formatTime(iso: string): string {
  const moment = new Date(iso)
  return Number.isNaN(moment.getTime()) ? iso : timeFormatter.format(moment)
}

function formatDateTime(iso: string): string {
  const moment = new Date(iso)
  return Number.isNaN(moment.getTime()) ? iso : dateTimeFormatter.format(moment)
}

/** O `MessageText` do pacote só lê o texto; o resto do `MessagePayload` é o mínimo que ele pede. */
function toPayload(message: OccurrenceConversationMessage): MessagePayload {
  return {
    content: message.bodyText,
    direction: message.direction,
    id: message.id,
    sender: message.direction === 'outbound' ? 'agent' : 'customer',
    timestamp: message.createdAt,
    type: 'text',
  }
}

/** Tique do pacote só para o que ele desenha; "na fila" e "devolvido" saem em texto (D7). */
const TICK_STATUS: Readonly<Partial<Record<string, string>>> = {
  bounced: 'failed',
  delivered: 'delivered',
  failed: 'failed',
  read: 'read',
  sent: 'sent',
}

type ConversationMessageProps = Readonly<{
  canManageContacts: boolean
  message: OccurrenceConversationMessage
  onAddContact: (suggestion: ContractorSenderSuggestion) => void
  /**
   * Spec 183 T703 (P8): o outro canal da mesma parte para a mensagem que falhou, e o que fazer
   * ao pedir o reenvio (o painel leva o texto ao compositor daquele canal).
   */
  resend?: Readonly<{
    channelFor: (message: OccurrenceConversationMessage) => OccurrenceConversationChannel | null
    onResend: (
      message: OccurrenceConversationMessage,
      channel: OccurrenceConversationChannel,
    ) => void
  }>
  /** Spec 183 T702d: as ações sobre cada anexo desta mensagem. */
  renderAttachmentActions?: (
    attachment: OccurrenceConversationAttachment,
    message: OccurrenceConversationMessage,
  ) => ReactNode
}>

/**
 * Spec 183 T407 (RF14, RF16): o balão. O lado e a cor vêm do tom (tokens da T704); o nome de quem
 * respondeu vem do cadastro na leitura, e o toque abre o cartão do contato com o endereço como
 * chegou. Fora dos contatos, o nome do `From` e "Adicionar aos contatos" já preenchido.
 */
export function ConversationMessage({
  canManageContacts,
  message,
  onAddContact,
  renderAttachmentActions,
  resend,
}: ConversationMessageProps) {
  const { t } = useTranslation('occurrenceConversation')
  const [isCardOpen, setCardOpen] = useState(false)
  const [isTimesOpen, setTimesOpen] = useState(false)
  const view = describeConversationMessage(message)
  const { author } = view
  const status = describeMessageStatus(message)
  const resendChannel = status?.failure == null ? null : (resend?.channelFor(message) ?? null)
  const timesId = `message-status-times-${message.id}`
  const toneClass =
    view.tone === 'outbound'
      ? styles.bubbleOutbound
      : view.tone === 'driver'
        ? styles.bubbleDriver
        : styles.bubbleContractor
  const isFailed = status?.failure != null
  const tick = status === null ? undefined : TICK_STATUS[status.value]

  return (
    <div className={view.side === 'mine' ? `${styles.row} ${styles.rowMine}` : styles.row}>
      <article
        className={[styles.bubble, toneClass, isFailed ? styles.bubbleFailed : '']
          .filter(Boolean)
          .join(' ')}
      >
        <header className={styles.author}>
          {author.kind === 'automatic' ? <span>{t('author.automatic')}</span> : null}
          {author.kind === 'operation' ? (
            <span>
              {author.name === ''
                ? t('author.operation')
                : t('author.operationNamed', { name: author.name })}
            </span>
          ) : null}
          {author.kind === 'driver' ? (
            <span>{author.name === '' ? t('author.driver') : author.name}</span>
          ) : null}
          {author.kind === 'contractorUser' ? <span>{t('author.contractorUser')}</span> : null}
          {author.kind === 'contact' ? (
            <>
              <button
                aria-expanded={isCardOpen}
                aria-label={t('author.showCard', { name: author.name })}
                className={styles.authorButton}
                onClick={() => setCardOpen((open) => !open)}
                type="button"
              >
                {author.name}
              </button>
              {author.roleLabel === '' ? null : <span>{author.roleLabel}</span>}
              {author.approvesCharges ? (
                <span className={styles.tag}>{t('author.approvesCharges')}</span>
              ) : null}
              {author.inactive ? <span className={styles.tag}>{t('author.inactive')}</span> : null}
            </>
          ) : null}
          {author.kind === 'unknown' ? (
            <>
              <span>{author.name}</span>
              {/** Spec 183 T903 (S2): sem DKIM alinhado, o `From` não prova quem mandou. */}
              {author.unverified ? (
                <span className={styles.tag}>{t('author.unverified')}</span>
              ) : (
                <span className={styles.tag}>{t('author.outside')}</span>
              )}
            </>
          ) : null}
        </header>

        {author.kind === 'contact' && isCardOpen ? (
          <dl className={styles.card}>
            <dt>{t('author.email')}</dt>
            <dd>{author.contact.email}</dd>
            {author.contact.phone === null ? null : (
              <>
                <dt>{t('author.phone')}</dt>
                <dd>{formatContractorContactPhone(author.contact.phone)}</dd>
              </>
            )}
            <dt>{t('author.preferredChannel')}</dt>
            <dd>{t(`author.channel.${author.contact.preferredChannel}`)}</dd>
            <dt>{t('author.optIn')}</dt>
            <dd>
              {author.contact.whatsappOptInAt === null
                ? t('author.optInNo')
                : t('author.optInYes', { date: formatDateTime(author.contact.whatsappOptInAt) })}
            </dd>
            <dt>{t('author.arrivedAs')}</dt>
            <dd>{author.arrivedAs}</dd>
          </dl>
        ) : null}

        {author.kind === 'unknown' ? (
          <div className={styles.author}>
            <span className={styles.hint}>{author.arrivedAs}</span>
            {author.unverified ? (
              <span className={styles.hint}>{t('author.unverifiedHint')}</span>
            ) : null}
            {canManageContacts && !author.unverified ? (
              <Button
                onClick={() => onAddContact(author.suggestion)}
                size="sm"
                type="button"
                variant="secondary"
              >
                {t('author.addContact')}
              </Button>
            ) : null}
          </div>
        ) : null}

        {message.bodyText === '' ? null : (
          <div className={styles.body}>
            <MessageText message={toPayload(message)} />
          </div>
        )}
        <ConversationAttachments
          attachments={message.attachments}
          {...(renderAttachmentActions === undefined
            ? {}
            : { renderActions: (attachment) => renderAttachmentActions(attachment, message) })}
        />

        {status?.failure == null ? null : (
          <div className={styles.failure} role="status">
            <p>{t(`failure.${status.failure}.${message.channel}`)}</p>
            {resendChannel === null || resend === undefined ? null : (
              <Button
                onClick={() => resend.onResend(message, resendChannel)}
                size="sm"
                type="button"
                variant="secondary"
              >
                <Icon name="send" />
                {t('failure.resend', { channel: t(`channel.${resendChannel}`) })}
              </Button>
            )}
          </div>
        )}

        <footer className={styles.meta}>
          {/** Spec 183 T703: por onde a mensagem foi — o selo diz o que aquele canal confirma. */}
          <span className={styles.channelTag}>{t(`channel.${message.channel}`)}</span>
          <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
          {status === null ? null : (
            <Button
              aria-controls={timesId}
              aria-expanded={isTimesOpen}
              className={styles.statusButton}
              onClick={() => setTimesOpen((open) => !open)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {tick === undefined ? null : (
                <StatusTicks status={tick} title={t(`status.${status.value}`)} />
              )}
              <span>{t(`status.${status.value}`)}</span>
            </Button>
          )}
        </footer>
        {status === null || !isTimesOpen ? null : (
          <ol aria-label={t('status.times')} className={styles.statusTimes} id={timesId}>
            {status.steps.map((step) => (
              <li key={step.status}>
                <span>{t(`status.${step.status}`)}</span>
                <time dateTime={step.at}>{formatDateTime(step.at)}</time>
              </li>
            ))}
          </ol>
        )}
      </article>
    </div>
  )
}
