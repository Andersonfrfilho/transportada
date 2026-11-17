/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useSendDriverAppMessageMutation } from '@/modules/occurrence-conversation/queries/occurrenceConversation.query'

import { useSendDriverAddressToWhatsAppGroup } from '../queries/useSendDriverAddressToWhatsAppGroup.query'
import { buildDriverAddressChatMessage } from '../shared/driverAddressMessage.service'
import styles from '../styles/trip.module.css'

type Channel = 'app' | 'whatsapp'

/**
 * Spec 343 (T6a): o escritório digita o endereço correto da entrega e o manda ao motorista pelo chat do app e/ou pelo
 * grupo de WhatsApp dele. Nada é enviado sozinho: cada canal é um clique, e o resultado de um não depende do outro.
 */
export function OccurrenceDriverAddress({
  occurrenceId,
  occurrenceKind,
}: Readonly<{ occurrenceId: string; occurrenceKind: 'document' | 'stop' }>): JSX.Element {
  const { t } = useTranslation('trip')
  const [isOpen, setIsOpen] = useState(false)
  const [address, setAddress] = useState('')
  const app = useSendDriverAppMessageMutation(occurrenceId)
  const whatsapp = useSendDriverAddressToWhatsAppGroup()
  const text = address.trim()
  const isBusy = app.isPending || whatsapp.isPending

  function send(channel: Channel): void {
    if (text.length === 0) return
    if (channel === 'app') {
      app.mutate({
        body: buildDriverAddressChatMessage(text),
        files: [],
        idempotencyKey: crypto.randomUUID(),
        uploaded: new Map(),
      })
      return
    }
    whatsapp.mutate({ addressText: text, occurrenceId, occurrenceKind })
  }

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)} size="sm" type="button" variant="secondary">
        <Icon name="map-pin" />
        {t('occurrenceDetail.driverAddress.open')}
      </Button>
    )
  }
  return (
    <div className={styles.driverAddressForm}>
      <label>
        {t('occurrenceDetail.driverAddress.label')}
        <textarea
          maxLength={300}
          onChange={(event) => setAddress(event.target.value)}
          placeholder={t('occurrenceDetail.driverAddress.placeholder')}
          value={address}
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
              ? 'occurrenceDetail.driverAddress.sending'
              : 'occurrenceDetail.driverAddress.sendApp',
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
              ? 'occurrenceDetail.driverAddress.sending'
              : 'occurrenceDetail.driverAddress.sendWhatsapp',
          )}
        </Button>
        <Button onClick={() => setIsOpen(false)} size="sm" type="button" variant="ghost">
          <Icon name="close" />
          {t('occurrenceDetail.driverAddress.close')}
        </Button>
      </div>
      {app.isSuccess ? (
        <p className={styles.hint} role="status">
          {t('occurrenceDetail.driverAddress.appSent')}
        </p>
      ) : null}
      {app.isError ? (
        <p className={styles.alert} role="alert">
          {t('occurrenceDetail.driverAddress.appFailed')}
        </p>
      ) : null}
      {whatsapp.isSuccess ? (
        <p className={styles.hint} role="status">
          {t('occurrenceDetail.driverAddress.whatsappSent')}
        </p>
      ) : null}
      {whatsapp.isError ? (
        <p className={styles.alert} role="alert">
          {t(`occurrenceDetail.driverAddress.${whatsappFailureKey(whatsapp.error)}`)}
        </p>
      ) : null}
    </div>
  )
}

/** O código da API vira a mensagem; o motivo fechado do Evolution não chega aqui, então "falhou" cobre o resto. */
export function whatsappFailureKey(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  if (code === 'DRIVER_WHATSAPP_GROUP_MISSING') return 'whatsappNoGroup'
  if (code === 'WHATSAPP_EVOLUTION_DISABLED' || code === 'WHATSAPP_EVOLUTION_NOT_CONFIGURED') {
    return 'whatsappDisconnected'
  }
  return 'whatsappFailed'
}
