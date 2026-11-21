/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { formatContractorContactPhone } from '@/modules/delivery-clients/shared/contractorContacts.validation'
import { buildTripOccurrenceRoute } from '@/modules/trip/shared/tripOccurrenceRoute.service'
import { useMomentFormatter } from '@/modules/shared/useMomentFormatter.hook'

import {
  useAssignUnassignedMutation,
  useDismissUnassignedMutation,
  useUnassignedMessagesQuery,
} from '../queries/occurrenceConversation.query'
import { OccurrenceConversationRequestError } from '../shared/occurrenceConversationClient.service'
import type { UnassignedMessage } from '../shared/occurrenceConversation.types'
import styles from '../styles/occurrenceConversation.module.css'

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
  const formatDateTime = useMomentFormatter()
  const assign = useAssignUnassignedMutation()
  const dismiss = useDismissUnassignedMutation()
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
                <span className={styles.tag}>{t(`participant.${candidate.participant}`)}</span>
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

      {assign.isError || dismiss.isError ? (
        <p className={styles.error} role="alert">
          {t(assign.isError ? errorKey : 'unassigned.error.dismiss')}
        </p>
      ) : null}
      {canAssign ? (
        <div className={styles.footer}>
          <Button
            disabled={assign.isPending || dismiss.isPending}
            onClick={() => dismiss.mutate({ ids: [message.id] })}
            size="sm"
            type="button"
            variant="secondary"
          >
            {dismiss.isPending ? t('unassigned.dismissing') : t('unassigned.dismiss')}
          </Button>
          {message.candidates.length > 0 ? (
            <Button
              disabled={chosen === '' || assign.isPending || dismiss.isPending}
              onClick={() => assign.mutate({ conversationId: chosen, unassignedId: message.id })}
              size="sm"
              type="button"
            >
              {t('unassigned.assign')}
            </Button>
          ) : null}
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
  const dismissAll = useDismissUnassignedMutation()
  const [confirming, setConfirming] = useState(false)
  const items = query.data ?? []
  if (items.length === 0) return null

  return (
    <section aria-labelledby="occurrence-unassigned-title" className={styles.unassigned}>
      <div className={styles.panelHead}>
        <h2 id="occurrence-unassigned-title">{t('unassigned.title', { count: items.length })}</h2>
        {canAssign && items.length > 1 && !confirming ? (
          <Button onClick={() => setConfirming(true)} size="sm" type="button" variant="secondary">
            {t('unassigned.dismissAll')}
          </Button>
        ) : null}
      </div>
      {confirming ? (
        <div className={styles.footer} role="group">
          <p className={styles.hint}>
            {t('unassigned.dismissAllConfirm', { count: items.length })}
          </p>
          <Button
            disabled={dismissAll.isPending}
            onClick={() => {
              dismissAll.mutate(
                { ids: items.map((item) => item.id) },
                { onSettled: () => setConfirming(false) },
              )
            }}
            size="sm"
            type="button"
          >
            {dismissAll.isPending ? t('unassigned.dismissing') : t('unassigned.dismissAllYes')}
          </Button>
          <Button
            disabled={dismissAll.isPending}
            onClick={() => setConfirming(false)}
            size="sm"
            type="button"
            variant="secondary"
          >
            {t('unassigned.dismissAllNo')}
          </Button>
        </div>
      ) : null}
      {dismissAll.isError ? (
        <p className={styles.error} role="alert">
          {t('unassigned.error.dismiss')}
        </p>
      ) : null}
      <p className={styles.hint}>{t('unassigned.hint')}</p>
      <ul className={styles.unassignedList}>
        {items.map((message) => (
          <UnassignedItem canAssign={canAssign} key={message.id} message={message} />
        ))}
      </ul>
    </section>
  )
}
