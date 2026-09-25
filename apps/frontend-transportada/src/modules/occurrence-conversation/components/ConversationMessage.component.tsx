/* Copyright (c) 2026 Ada Technology. MIT License. */
import { MessageText, StatusTicks, type MessagePayload } from '@adatechnology/conversations-ui'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { formatContractorContactPhone } from '@/modules/delivery-clients/shared/contractorContacts.validation'

import { describeConversationMessage } from '../shared/occurrenceConversation.service'
import type {
  OccurrenceConversationAttachment,
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
}: ConversationMessageProps) {
  const { t } = useTranslation('occurrenceConversation')
  const [isCardOpen, setCardOpen] = useState(false)
  const view = describeConversationMessage(message)
  const { author, status } = view
  const toneClass =
    view.tone === 'outbound'
      ? styles.bubbleOutbound
      : view.tone === 'driver'
        ? styles.bubbleDriver
        : styles.bubbleContractor
  const isFailed = status?.value === 'failed' || status?.value === 'bounced'
  const statusLabel =
    status === null
      ? null
      : status.at === null
        ? t(`status.${status.value}`)
        : t('status.at', { status: t(`status.${status.value}`), time: formatDateTime(status.at) })
  const tick = status === null ? undefined : TICK_STATUS[status.value]

  return (
    <div className={view.side === 'mine' ? `${styles.row} ${styles.rowMine}` : styles.row}>
      <article
        className={[styles.bubble, toneClass, isFailed ? styles.bubbleFailed : '']
          .filter(Boolean)
          .join(' ')}
      >
        <header className={styles.author}>
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
              <span className={styles.tag}>{t('author.outside')}</span>
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
            {canManageContacts ? (
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

        <footer className={styles.meta}>
          <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
          {status === null || statusLabel === null ? null : (
            <span className={styles.status} title={statusLabel}>
              {tick === undefined ? null : <StatusTicks status={tick} title={statusLabel} />}
              <span>{t(`status.${status.value}`)}</span>
            </span>
          )}
        </footer>
      </article>
    </div>
  )
}
