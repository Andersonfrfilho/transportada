/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useIsOnline } from '@/modules/conversation/hooks/useIsOnline.hook'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { useClientBoletoEmailPending } from '../hooks/useClientBoletoEmailPending.hook'
import { useClientBoletoEmailSend } from '../hooks/useClientBoletoEmailSend.hook'
import type { ClientBoletoEmailOptions } from '../shared/clientBoletoEmail.types'
import { getClientBoletoEmailRuntime } from '../shared/clientBoletoEmailInstance.service'
import { looksLikeEmailAddress } from '../shared/clientBoletoEmailVisibility.service'
import styles from '../styles/clientEmail.module.css'

type ClientEmailSendSheetProps = Readonly<{
  occurrenceId: string
  onClose: () => void
  options: ClientBoletoEmailOptions | undefined
}>

type AddMode = 'save' | 'send'

/**
 * Spec 279 T6 (RF6/RF11): a folha "Enviar ao cliente". Lista os e-mails guardados (mascarados, por `emailId`),
 * deixa digitar um novo ("Adicionar e-mail") e escolher só enviar ou enviar e guardar. Sem sinal, o envio vai
 * para a fila com a mesma chave de idempotência.
 */
export function ClientEmailSendSheet({
  occurrenceId,
  onClose,
  options,
}: ClientEmailSendSheetProps) {
  const { t } = useTranslation('clientEmail')
  const isOnline = useIsOnline()
  const titleId = useId()
  const addressId = useId()
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose })
  const { reset, send, status } = useClientBoletoEmailSend({ isOnline, occurrenceId })
  const pending = useClientBoletoEmailPending(occurrenceId)
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])
  const [isAdding, setAdding] = useState(false)
  const [address, setAddress] = useState('')
  const [mode, setMode] = useState<AddMode>('send')
  const [showInvalid, setShowInvalid] = useState(false)

  const savedEmails = options?.clientEmails ?? []
  const isSending = status.kind === 'sending'
  const hasNewAddress = isAdding && address.trim().length > 0
  const hasChoice = selectedIds.length > 0 || hasNewAddress
  const queuedCount = pending.filter((item) => item.state === 'queued').length
  const failedItems = pending.filter((item) => item.state === 'failed')

  function toggle(emailId: string): void {
    setSelectedIds((current) =>
      current.includes(emailId) ? current.filter((id) => id !== emailId) : [...current, emailId],
    )
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault()
    if (!hasChoice || isSending) return
    if (hasNewAddress && !looksLikeEmailAddress(address)) {
      setShowInvalid(true)
      return
    }
    setShowInvalid(false)
    void send({
      emailIds: selectedIds,
      ...(hasNewAddress ? { newAddress: address.trim() } : {}),
      save: hasNewAddress && mode === 'save',
    })
  }

  function handleAnother(): void {
    reset()
    setSelectedIds([])
    setAddress('')
    setAdding(false)
    setMode('send')
  }

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className={styles.backdrop}
      onClick={onClose}
      onKeyDown={handleKeyDown}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <form
        className={styles.sheet}
        onClick={(event) => event.stopPropagation()}
        noValidate
        onSubmit={handleSubmit}
      >
        <header className={styles.sheetHeader}>
          <h2 className={styles.sheetTitle} id={titleId}>
            {t('sheet.title')}
          </h2>
          <button
            aria-label={t('sheet.cancel')}
            className={styles.sheetClose}
            onClick={onClose}
            type="button"
          >
            <Icon aria-hidden="true" name="close" />
          </button>
        </header>

        {status.kind === 'sent' ? (
          <section aria-live="polite" className={styles.resultList}>
            <ul className={styles.resultItems}>
              {status.outcome.results.map((result) => (
                <li
                  className={styles.resultItem}
                  data-kind={result.kind}
                  key={result.addressMasked}
                >
                  <Icon
                    aria-hidden="true"
                    name={result.kind === 'failed' ? 'alert' : 'check'}
                    size="sm"
                  />
                  <span>
                    {result.addressMasked} · {t(`result.${result.kind}`)}
                  </span>
                </li>
              ))}
            </ul>
            {status.outcome.savedEmailId === null ? null : (
              <p className={styles.note}>{t('result.saved')}</p>
            )}
            <Button onClick={handleAnother} type="button" variant="secondary">
              {t('add.button')}
            </Button>
          </section>
        ) : status.kind === 'queued' ? (
          <section aria-live="polite" className={styles.resultList}>
            <p className={styles.note}>{t('result.queuedOffline')}</p>
            <Button onClick={handleAnother} type="button" variant="secondary">
              {t('add.button')}
            </Button>
          </section>
        ) : (
          <>
            {isOnline ? null : <p className={styles.note}>{t('sheet.offlineHint')}</p>}
            {savedEmails.length > 0 ? (
              <fieldset className={styles.savedList}>
                <legend className={styles.legend}>{t('sheet.savedTitle')}</legend>
                {savedEmails.map((email) => (
                  <label className={styles.savedItem} key={email.emailId}>
                    <input
                      checked={selectedIds.includes(email.emailId)}
                      className={styles.check}
                      onChange={() => toggle(email.emailId)}
                      type="checkbox"
                    />
                    <span className={styles.savedText}>
                      <strong>{email.addressMasked}</strong>
                      <span className={styles.savedLabel}>{email.label}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : options === undefined ? null : (
              <p className={styles.note}>{t('sheet.empty')}</p>
            )}
            {options === undefined ? null : (
              <p className={styles.counter}>
                {t('sheet.limit', { limit: options.sentLimit, sent: options.sentCount })}
              </p>
            )}

            {isAdding ? (
              <div className={styles.addBox}>
                <label className={styles.addLabel} htmlFor={addressId}>
                  {t('add.address')}
                </label>
                <input
                  autoComplete="off"
                  className={`panel__input ${styles.addInput}`}
                  id={addressId}
                  inputMode="email"
                  onChange={(event) => setAddress(event.target.value)}
                  type="email"
                  value={address}
                />
                {showInvalid ? (
                  <p className={styles.error} role="alert">
                    {t('add.invalid')}
                  </p>
                ) : null}
                <fieldset className={styles.modeGroup}>
                  <legend className={styles.legend}>{t('add.modeLabel')}</legend>
                  {(['send', 'save'] as const).map((value) => (
                    <label className={styles.modeItem} key={value}>
                      <input
                        checked={mode === value}
                        name="client-email-mode"
                        onChange={() => setMode(value)}
                        type="radio"
                      />
                      <span>{value === 'send' ? t('add.sendOnly') : t('add.saveAndSend')}</span>
                    </label>
                  ))}
                </fieldset>
              </div>
            ) : (
              <Button onClick={() => setAdding(true)} type="button" variant="secondary">
                {t('add.button')}
              </Button>
            )}

            {queuedCount > 0 ? (
              <p className={styles.note} role="status">
                {t('pending.queued', { count: queuedCount })}
              </p>
            ) : null}
            {failedItems.map((item) => (
              <p className={styles.error} key={item.request.idempotencyKey} role="alert">
                {t('pending.failed')}{' '}
                <button
                  className={styles.linkButton}
                  onClick={() =>
                    void getClientBoletoEmailRuntime().outbox.requeue(item.request.idempotencyKey)
                  }
                  type="button"
                >
                  {t('pending.retry')}
                </button>{' '}
                <button
                  className={styles.linkButton}
                  onClick={() =>
                    void getClientBoletoEmailRuntime().outbox.discard(item.request.idempotencyKey)
                  }
                  type="button"
                >
                  {t('pending.discard')}
                </button>
              </p>
            ))}
            {status.kind === 'error' ? (
              <p className={styles.error} role="alert">
                {t(`error.${status.errorKey}`)}
              </p>
            ) : null}
            <Button aria-busy={isSending} disabled={!hasChoice || isSending} type="submit">
              <Icon aria-hidden="true" name="send" size="sm" />
              {isSending ? t('sheet.sending') : t('sheet.send')}
            </Button>
          </>
        )}
      </form>
    </div>
  )
}
