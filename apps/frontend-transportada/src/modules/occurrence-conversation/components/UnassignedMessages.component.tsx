/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { formatContractorContactPhone } from '@/modules/delivery-clients/shared/contractorContacts.validation'
import { buildTripOccurrenceRoute } from '@/modules/trip/shared/tripOccurrenceRoute.service'

import {
  useAssignUnassignedMutation,
  useUnassignedMessagesQuery,
} from '../queries/occurrenceConversation.query'
import { OccurrenceConversationRequestError } from '../shared/occurrenceConversationClient.service'
import type { UnassignedMessage } from '../shared/occurrenceConversation.types'
import styles from '../styles/occurrenceConversation.module.css'

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

function formatDateTime(iso: string): string {
  const moment = new Date(iso)
  return Number.isNaN(moment.getTime()) ? iso : dateTimeFormatter.format(moment)
}

const KNOWN_ERRORS = new Set([
  'OCCURRENCE_CONVERSATION_ALREADY_ASSIGNED',
  'OCCURRENCE_CONVERSATION_ASSIGNMENT_INVALID',
  'OCCURRENCE_CONVERSATION_UNASSIGNED_NOT_FOUND',
])

/** WhatsApp chega só com dígitos e DDI; na tela, a máscara da casa. E-mail fica como chegou. */
function formatSender(message: UnassignedMessage): string {
  return message.channel === 'whatsapp'
    ? formatContractorContactPhone(message.senderAddress)
    : message.senderAddress
}

function UnassignedItem({
  canAssign,
  message,
}: Readonly<{ canAssign: boolean; message: UnassignedMessage }>) {
  const { t } = useTranslation('occurrenceConversation')
  const assign = useAssignUnassignedMutation()
  const [chosen, setChosen] = useState(message.candidates[0]?.conversationId ?? '')
  const error = assign.error
  const errorKey =
    error instanceof OccurrenceConversationRequestError && KNOWN_ERRORS.has(error.code)
      ? `unassigned.error.${error.code}`
      : 'unassigned.error.generic'

  return (
    <li className={styles.unassignedItem}>
      <header className={styles.author}>
        <span>{message.contact?.name || formatSender(message)}</span>
        {message.contact === null ? null : (
          <span className={styles.hint}>{formatSender(message)}</span>
        )}
        <span className={styles.tag}>{t(`unassigned.channel.${message.channel}`)}</span>
        <time className={styles.hint} dateTime={message.receivedAt}>
          {formatDateTime(message.receivedAt)}
        </time>
      </header>
      <p className={styles.body}>
        {message.bodyText === '' ? t('unassigned.noText') : message.bodyText}
      </p>

      {message.candidates.length === 0 ? (
        <p className={styles.hint}>{t('unassigned.noCandidates')}</p>
      ) : (
        <fieldset className={styles.fieldset} disabled={!canAssign || assign.isPending}>
          <legend>{t('unassigned.choose')}</legend>
          {message.candidates.map((candidate) => (
            <label className={styles.candidate} key={candidate.conversationId}>
              <input
                checked={chosen === candidate.conversationId}
                name={`unassigned-${message.id}`}
                onChange={() => setChosen(candidate.conversationId)}
                type="radio"
                value={candidate.conversationId}
              />
              <span>
                <strong>{candidate.contractorName}</strong>
                {candidate.lastOutbound === null ? null : (
                  <span className={styles.hint}>
                    {t('unassigned.lastOutbound', {
                      at: formatDateTime(candidate.lastOutbound.at),
                      preview: candidate.lastOutbound.preview,
                    })}
                  </span>
                )}
                <a href={buildTripOccurrenceRoute(candidate.occurrenceId)}>
                  {t('unassigned.openOccurrence')}
                </a>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {assign.isError ? (
        <p className={styles.error} role="alert">
          {t(errorKey)}
        </p>
      ) : null}
      {canAssign && message.candidates.length > 0 ? (
        <div className={styles.footer}>
          <Button
            disabled={chosen === '' || assign.isPending}
            onClick={() => assign.mutate({ conversationId: chosen, unassignedId: message.id })}
            size="sm"
            type="button"
          >
            {t('unassigned.assign')}
          </Button>
        </div>
      ) : null}
    </li>
  )
}

/**
 * Spec 183 T505 (RF9): as mensagens que chegaram sem conversa certa — duas conversas abertas com a
 * mesma contratante, ou nenhuma. O operador escolhe; a tela nunca escolhe por ele. Sem mensagem na
 * fila, nada aparece.
 */
export function UnassignedMessages({
  canAssign,
  companyId,
}: Readonly<{ canAssign: boolean; companyId?: string }>) {
  const { t } = useTranslation('occurrenceConversation')
  const query = useUnassignedMessagesQuery({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: true,
  })
  const items = query.data ?? []
  if (items.length === 0) return null

  return (
    <section aria-labelledby="occurrence-unassigned-title" className={styles.unassigned}>
      <div className={styles.panelHead}>
        <h2 id="occurrence-unassigned-title">{t('unassigned.title', { count: items.length })}</h2>
      </div>
      <p className={styles.hint}>{t('unassigned.hint')}</p>
      <ul className={styles.unassignedList}>
        {items.map((message) => (
          <UnassignedItem canAssign={canAssign} key={message.id} message={message} />
        ))}
      </ul>
    </section>
  )
}
