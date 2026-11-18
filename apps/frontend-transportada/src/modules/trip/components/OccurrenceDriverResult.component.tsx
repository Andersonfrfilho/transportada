/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useSendDriverAppMessageMutation } from '@/modules/occurrence-conversation/queries/occurrenceConversation.query'

import { useSendDriverResultToWhatsAppGroup } from '../queries/useSendDriverAddressToWhatsAppGroup.query'
import { buildDriverResultText } from '../shared/driverResultMessage.service'
import type { TripOccurrenceCaseDecisionKind } from '../shared/tripOccurrenceFeed.service'
import styles from '../styles/trip.module.css'
import { whatsappFailureKey } from './OccurrenceDriverAddress.component'

type Channel = 'app' | 'whatsapp'

/**
 * Spec 343: o escritório manda o resultado da ocorrência ao motorista pelo chat do app e/ou pelo grupo de WhatsApp.
 * Com decisão da contratante a mensagem já vem preenchida (e editável); sem ela o escritório escreve o próprio texto.
 */
export function OccurrenceDriverResult({
  decision,
  occurrenceId,
  occurrenceKind,
}: Readonly<{
  decision: null | Readonly<{ kind: TripOccurrenceCaseDecisionKind; note: string }>
  occurrenceId: string
  occurrenceKind: 'document' | 'stop'
}>): JSX.Element {
  const { t } = useTranslation('trip')
  const [isOpen, setIsOpen] = useState(false)
  const [edited, setEdited] = useState<null | string>(null)
  const app = useSendDriverAppMessageMutation(occurrenceId)
  const whatsapp = useSendDriverResultToWhatsAppGroup()
  const suggestion =
    decision === null
      ? ''
      : buildDriverResultText({
          lead: t(`occurrenceDetail.driverResult.decisionLead.${decision.kind}`),
          note: decision.note,
          noteLabel: t('occurrenceDetail.driverResult.noteLabel'),
        })
  const text = (edited ?? suggestion).trim()
  const isBusy = app.isPending || whatsapp.isPending

  function send(channel: Channel): void {
    if (text.length === 0) return
    if (channel === 'app') {
      app.mutate({
        body: text,
        files: [],
        idempotencyKey: crypto.randomUUID(),
        uploaded: new Map(),
      })
      return
    }
    whatsapp.mutate({ occurrenceId, occurrenceKind, text })
  }

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)} size="sm" type="button" variant="secondary">
        <Icon name="message" />
        {t('occurrenceDetail.driverResult.open')}
      </Button>
    )
  }
  return (
    <div className={styles.driverAddressForm}>
      <label>
        {t('occurrenceDetail.driverResult.label')}
        <textarea
          maxLength={1000}
          onChange={(event) => setEdited(event.target.value)}
          placeholder={t('occurrenceDetail.driverResult.placeholder')}
          value={edited ?? suggestion}
        />
      </label>
      <div className={styles.driverAddressActions}>
        <Button
          disabled={text.length === 0 || isBusy}
          onClick={() => send('app')}
          size="sm"
          type="button"
        >
          <Icon name="send" />
          {t(
            app.isPending
              ? 'occurrenceDetail.driverResult.sending'
              : 'occurrenceDetail.driverResult.sendApp',
          )}
        </Button>
        <Button
          disabled={text.length === 0 || isBusy}
          onClick={() => send('whatsapp')}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Icon name="message" />
          {t(
            whatsapp.isPending
              ? 'occurrenceDetail.driverResult.sending'
              : 'occurrenceDetail.driverResult.sendWhatsapp',
          )}
        </Button>
        <Button onClick={() => setIsOpen(false)} size="sm" type="button" variant="ghost">
          <Icon name="close" />
          {t('occurrenceDetail.driverResult.close')}
        </Button>
      </div>
      {app.isSuccess ? (
        <p className={styles.hint} role="status">
          {t('occurrenceDetail.driverResult.appSent')}
        </p>
      ) : null}
      {app.isError ? (
        <p className={styles.alert} role="alert">
          {t('occurrenceDetail.driverResult.appFailed')}
        </p>
      ) : null}
      {whatsapp.isSuccess ? (
        <p className={styles.hint} role="status">
          {t('occurrenceDetail.driverResult.whatsappSent')}
        </p>
      ) : null}
      {whatsapp.isError ? (
        <p className={styles.alert} role="alert">
          {t(`occurrenceDetail.driverResult.${whatsappFailureKey(whatsapp.error)}`)}
        </p>
      ) : null}
    </div>
  )
}
