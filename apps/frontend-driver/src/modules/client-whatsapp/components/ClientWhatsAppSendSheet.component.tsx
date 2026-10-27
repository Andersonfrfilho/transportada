/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import emailStyles from '@/modules/client-email/styles/clientEmail.module.css'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useIsOnline } from '@/modules/conversation/hooks/useIsOnline.hook'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { useClientBoletoWhatsAppPending } from '../hooks/useClientBoletoWhatsAppPending.hook'
import { useClientBoletoWhatsAppSend } from '../hooks/useClientBoletoWhatsAppSend.hook'
import type {
  ClientBoletoWhatsAppFailureReason,
  ClientBoletoWhatsAppOptions,
} from '../shared/clientBoletoWhatsApp.types'
import { getClientBoletoWhatsAppRuntime } from '../shared/clientBoletoWhatsAppInstance.service'
import {
  formatClientWhatsAppNumber,
  parseClientWhatsAppNumber,
} from '../shared/clientBoletoWhatsAppNumber.service'
import styles from '../styles/clientWhatsApp.module.css'

type ClientWhatsAppSendSheetProps = Readonly<{
  occurrenceId: string
  onClose: () => void
  options: ClientBoletoWhatsAppOptions | undefined
}>

type Step = 'choose' | 'confirm'

/** "Tentar de novo" vale quando o problema pode passar (instância caiu, erro do provedor); o resto pede o e-mail. */
const RETRYABLE_REASONS: readonly ClientBoletoWhatsAppFailureReason[] = [
  'send_failed',
  'whatsapp_disconnected',
]

function isRetryable(reason: ClientBoletoWhatsAppFailureReason | null): boolean {
  return reason === null || RETRYABLE_REASONS.includes(reason)
}

/**
 * Spec 281 T8 (RF3/RF10/D13): a folha "Enviar por WhatsApp". Lista os números guardados do cliente (mascarados, por
 * `contactId`), deixa informar um número que falta — que só segue depois da tela de confirmação, com o número
 * formatado — e escolher só enviar ou enviar e guardar. Sem sinal, o envio vai para a fila com a mesma chave.
 */
export function ClientWhatsAppSendSheet({
  occurrenceId,
  onClose,
  options,
}: ClientWhatsAppSendSheetProps) {
  const { t } = useTranslation('clientWhatsApp')
  const isOnline = useIsOnline()
  const titleId = useId()
  const numberId = useId()
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose })
  const { reset, resend, send, status } = useClientBoletoWhatsAppSend({ isOnline, occurrenceId })
  const pending = useClientBoletoWhatsAppPending(occurrenceId)
  const [step, setStep] = useState<Step>('choose')
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])
  const [isAdding, setAdding] = useState(false)
  const [rawNumber, setRawNumber] = useState('')
  const [shouldSave, setShouldSave] = useState(false)
  const [showInvalid, setShowInvalid] = useState(false)

  const savedContacts = options?.contacts ?? []
  const isSending = status.kind === 'sending'
  const hasNewNumber = isAdding && rawNumber.trim().length > 0
  const hasChoice = selectedIds.length > 0 || hasNewNumber
  const parsedNumber = hasNewNumber ? parseClientWhatsAppNumber(rawNumber) : null
  const queuedCount = pending.filter((item) => item.state === 'queued').length
  const failedItems = pending.filter((item) => item.state === 'failed')
  const failedDeliveries = (options?.deliveries ?? []).filter(
    (delivery) => delivery.status === 'failed' && isRetryable(delivery.reason),
  )

  function toggle(contactId: string): void {
    setSelectedIds((current) =>
      current.includes(contactId)
        ? current.filter((id) => id !== contactId)
        : [...current, contactId],
    )
  }

  function submitChoice(): void {
    void send({ contactIds: selectedIds, save: false })
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault()
    if (!hasChoice || isSending) return
    if (step === 'confirm') {
      if (parsedNumber === null) return
      void send({ contactIds: selectedIds, number: parsedNumber, save: shouldSave })
      return
    }
    if (!hasNewNumber) {
      submitChoice()
      return
    }
    if (parsedNumber === null) {
      setShowInvalid(true)
      return
    }
    setShowInvalid(false)
    setStep('confirm')
  }

  function handleAnother(): void {
    reset()
    setStep('choose')
    setSelectedIds([])
    setRawNumber('')
    setAdding(false)
    setShouldSave(false)
  }

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className={emailStyles.backdrop}
      onClick={onClose}
      onKeyDown={handleKeyDown}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <form
        className={emailStyles.sheet}
        noValidate
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <header className={emailStyles.sheetHeader}>
          <h2 className={emailStyles.sheetTitle} id={titleId}>
            {t('sheet.title')}
          </h2>
          <button
            aria-label={t('sheet.cancel')}
            className={emailStyles.sheetClose}
            onClick={onClose}
            type="button"
          >
            <Icon aria-hidden="true" name="close" />
          </button>
        </header>

        {status.kind === 'sent' ? (
          <section aria-live="polite" className={emailStyles.resultList}>
            <ul className={emailStyles.resultItems}>
              {status.outcome.results.map((result) => (
                <li
                  className={emailStyles.resultItem}
                  data-kind={result.kind === 'failed' ? 'failed' : 'queued'}
                  key={result.deliveryId}
                >
                  <Icon
                    aria-hidden="true"
                    name={result.kind === 'failed' ? 'alert' : 'check'}
                    size="sm"
                  />
                  <span>
                    {result.numberMasked} · {t(`result.${result.kind}`)}
                    {result.kind === 'failed'
                      ? ` — ${t(`reason.${result.reason ?? 'send_failed'}`)}`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
            {status.outcome.results.some(
              (result) => result.kind === 'failed' && !isRetryable(result.reason),
            ) ? (
              <p className={emailStyles.note}>{t('result.useEmail')}</p>
            ) : null}
            {status.outcome.savedContactId === null ? null : (
              <p className={emailStyles.note}>{t('result.saved')}</p>
            )}
            {status.outcome.results
              .filter((result) => result.kind === 'failed' && isRetryable(result.reason))
              .map((result) => (
                <Button
                  disabled={isSending}
                  key={result.deliveryId}
                  onClick={() => void resend(result.deliveryId)}
                  type="button"
                  variant="secondary"
                >
                  {t('resend.button', { number: result.numberMasked })}
                </Button>
              ))}
            <Button onClick={handleAnother} type="button" variant="secondary">
              {t('add.another')}
            </Button>
          </section>
        ) : status.kind === 'queued' ? (
          <section aria-live="polite" className={emailStyles.resultList}>
            <p className={emailStyles.note}>{t('result.queuedOffline')}</p>
            <Button onClick={handleAnother} type="button" variant="secondary">
              {t('add.another')}
            </Button>
          </section>
        ) : step === 'confirm' && parsedNumber !== null ? (
          <>
            <p className={emailStyles.note}>{t('confirm.question')}</p>
            <p className={styles.confirmNumber} data-testid="whatsapp-confirm-number">
              {formatClientWhatsAppNumber(parsedNumber)}
            </p>
            <label className={emailStyles.modeItem}>
              <input
                checked={shouldSave}
                onChange={(event) => setShouldSave(event.target.checked)}
                type="checkbox"
              />
              <span>{t('confirm.save')}</span>
            </label>
            {isOnline ? null : <p className={emailStyles.note}>{t('sheet.offlineHint')}</p>}
            {status.kind === 'error' ? (
              <p className={emailStyles.error} role="alert">
                {t(`error.${status.errorKey}`)}
              </p>
            ) : null}
            <div className={styles.confirmActions}>
              <Button
                disabled={isSending}
                onClick={() => setStep('choose')}
                type="button"
                variant="secondary"
              >
                {t('confirm.back')}
              </Button>
              <Button aria-busy={isSending} disabled={isSending} type="submit">
                <Icon aria-hidden="true" name="send" size="sm" />
                {isSending ? t('sheet.sending') : t('confirm.send')}
              </Button>
            </div>
          </>
        ) : (
          <>
            {isOnline ? null : <p className={emailStyles.note}>{t('sheet.offlineHint')}</p>}
            {savedContacts.length > 0 ? (
              <fieldset className={emailStyles.savedList}>
                <legend className={emailStyles.legend}>{t('sheet.savedTitle')}</legend>
                {savedContacts.map((contact) => (
                  <label className={emailStyles.savedItem} key={contact.contactId}>
                    <input
                      checked={selectedIds.includes(contact.contactId)}
                      className={emailStyles.check}
                      onChange={() => toggle(contact.contactId)}
                      type="checkbox"
                    />
                    <span className={emailStyles.savedText}>
                      <strong>{contact.numberMasked}</strong>
                      <span className={emailStyles.savedLabel}>{contact.label}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : options === undefined ? null : (
              <p className={emailStyles.note}>{t('sheet.empty')}</p>
            )}
            {options === undefined ? null : (
              <p className={emailStyles.counter}>
                {t('sheet.limit', { limit: options.sentLimit, sent: options.sentCount })}
              </p>
            )}

            {options !== undefined && options.deliveries.length > 0 ? (
              <ul className={styles.history} aria-label={t('history.title')}>
                {options.deliveries.map((delivery) => (
                  <li
                    className={styles.historyItem}
                    data-status={delivery.status}
                    key={delivery.id}
                  >
                    <Icon
                      aria-hidden="true"
                      name={delivery.status === 'failed' ? 'alert' : 'check'}
                      size="sm"
                    />
                    <span>
                      {delivery.numberMasked ?? t('history.unknownNumber')} ·{' '}
                      {t(`history.${delivery.status}`)}
                      {delivery.status === 'failed'
                        ? ` — ${t(`reason.${delivery.reason ?? 'send_failed'}`)}`
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {failedDeliveries.map((delivery) => (
              <Button
                disabled={isSending || !isOnline}
                key={delivery.id}
                onClick={() => void resend(delivery.id)}
                type="button"
                variant="secondary"
              >
                {t('resend.button', {
                  number: delivery.numberMasked ?? t('history.unknownNumber'),
                })}
              </Button>
            ))}

            {isAdding ? (
              <div className={emailStyles.addBox}>
                <label className={emailStyles.addLabel} htmlFor={numberId}>
                  {t('add.number')}
                </label>
                <input
                  autoComplete="off"
                  className={`panel__input ${emailStyles.addInput}`}
                  id={numberId}
                  inputMode="tel"
                  onChange={(event) => setRawNumber(event.target.value)}
                  placeholder={t('add.placeholder')}
                  type="tel"
                  value={rawNumber}
                />
                {showInvalid ? (
                  <p className={emailStyles.error} role="alert">
                    {t('add.invalid')}
                  </p>
                ) : null}
              </div>
            ) : (
              <Button onClick={() => setAdding(true)} type="button" variant="secondary">
                {t('add.button')}
              </Button>
            )}

            {queuedCount > 0 ? (
              <p className={emailStyles.note} role="status">
                {t('pending.queued', { count: queuedCount })}
              </p>
            ) : null}
            {failedItems.map((item) => (
              <p className={emailStyles.error} key={item.request.idempotencyKey} role="alert">
                {t('pending.failed')}{' '}
                <button
                  className={emailStyles.linkButton}
                  onClick={() =>
                    void getClientBoletoWhatsAppRuntime().outbox.requeue(
                      item.request.idempotencyKey,
                    )
                  }
                  type="button"
                >
                  {t('pending.retry')}
                </button>{' '}
                <button
                  className={emailStyles.linkButton}
                  onClick={() =>
                    void getClientBoletoWhatsAppRuntime().outbox.discard(
                      item.request.idempotencyKey,
                    )
                  }
                  type="button"
                >
                  {t('pending.discard')}
                </button>
              </p>
            ))}
            {status.kind === 'error' ? (
              <p className={emailStyles.error} role="alert">
                {t(`error.${status.errorKey}`)}
              </p>
            ) : null}
            <Button aria-busy={isSending} disabled={!hasChoice || isSending} type="submit">
              <Icon aria-hidden="true" name="send" size="sm" />
              {isSending ? t('sheet.sending') : hasNewNumber ? t('sheet.review') : t('sheet.send')}
            </Button>
          </>
        )}
      </form>
    </div>
  )
}
