/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useSendDriverAppMessageMutation } from '@/modules/occurrence-conversation/queries/occurrenceConversation.query'

import { formatPostalCode } from '@/modules/shared/postalCode.service'
import { usePostalCodeLookup } from '@/modules/shared/usePostalCodeLookup.hook'

import {
  useFindDriverAddressPoint,
  useSendDriverAddressToWhatsAppGroup,
} from '../queries/useSendDriverAddressToWhatsAppGroup.query'
import {
  buildDriverAddressChatMessage,
  composeDriverAddressText,
  type DriverAddressFields,
} from '../shared/driverAddressMessage.service'
import styles from '../styles/trip.module.css'

type Channel = 'app' | 'whatsapp'

const EMPTY_FIELDS: DriverAddressFields = {
  city: '',
  district: '',
  number: '',
  postalCode: '',
  state: '',
  street: '',
}

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
  const [fields, setFields] = useState<DriverAddressFields>(EMPTY_FIELDS)
  const app = useSendDriverAppMessageMutation(occurrenceId)
  const whatsapp = useSendDriverAddressToWhatsAppGroup()
  const point = useFindDriverAddressPoint()
  const postalCode = usePostalCodeLookup<DriverAddressFields>({
    fields: { city: 'city', district: 'district', state: 'state', street: 'street' },
    patch: (values) => setFields((current) => ({ ...current, ...values })),
  })
  const text = composeDriverAddressText(fields)
  const isBusy = app.isPending || whatsapp.isPending || point.isPending

  function change(key: keyof DriverAddressFields, value: string): void {
    setFields((current) => ({ ...current, [key]: value }))
  }

  /** O ponto só se pede com o endereço completo; sem ele, ou sem resposta, o envio segue só com o texto. */
  async function findPoint() {
    const complete =
      fields.postalCode.replace(/\D/gu, '').length === 8 &&
      fields.street.trim() !== '' &&
      fields.city.trim() !== '' &&
      fields.state.trim().length === 2
    if (!complete) return undefined
    const found = await point.mutateAsync({
      ...fields,
      postalCode: fields.postalCode.replace(/\D/gu, ''),
      state: fields.state.trim().toUpperCase(),
    })
    return found ?? undefined
  }

  async function send(channel: Channel): Promise<void> {
    if (text.length === 0) return
    const found = await findPoint()
    if (channel === 'app') {
      app.mutate({
        body: buildDriverAddressChatMessage(text, found),
        files: [],
        idempotencyKey: crypto.randomUUID(),
        uploaded: new Map(),
      })
      return
    }
    whatsapp.mutate({
      addressText: text,
      occurrenceId,
      occurrenceKind,
      ...(found === undefined ? {} : found),
    })
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
      <div className={styles.driverAddressGrid}>
        <label className={styles.driverAddressCep}>
          <span>{t('occurrenceDetail.driverAddress.postalCode')}</span>
          <input
            autoComplete="postal-code"
            inputMode="numeric"
            maxLength={9}
            onChange={(event) => {
              const value = formatPostalCode(event.target.value)
              change('postalCode', value)
              postalCode.lookup(value)
            }}
            placeholder="00000-000"
            value={fields.postalCode}
          />
        </label>
        <label className={styles.driverAddressNumber}>
          <span>{t('occurrenceDetail.driverAddress.number')}</span>
          <input
            maxLength={20}
            onChange={(event) => change('number', event.target.value)}
            value={fields.number}
          />
        </label>
        {postalCode.status === 'pending' ? (
          <p className={`${styles.hint} ${styles.driverAddressFull}`} role="status">
            {t('occurrenceDetail.driverAddress.postalCodeSearching')}
          </p>
        ) : null}
        {postalCode.status === 'missing' ? (
          <p className={`${styles.hint} ${styles.driverAddressFull}`} role="status">
            {t('occurrenceDetail.driverAddress.postalCodeMissing')}
          </p>
        ) : null}
        <label className={styles.driverAddressStreet}>
          <span>{t('occurrenceDetail.driverAddress.street')}</span>
          <input
            maxLength={120}
            onChange={(event) => change('street', event.target.value)}
            value={fields.street}
          />
        </label>
        <label className={styles.driverAddressDistrict}>
          <span>{t('occurrenceDetail.driverAddress.district')}</span>
          <input
            maxLength={60}
            onChange={(event) => change('district', event.target.value)}
            value={fields.district}
          />
        </label>
        <label className={styles.driverAddressCity}>
          <span>{t('occurrenceDetail.driverAddress.city')}</span>
          <input
            maxLength={60}
            onChange={(event) => change('city', event.target.value)}
            value={fields.city}
          />
        </label>
        <label className={styles.driverAddressState}>
          <span>{t('occurrenceDetail.driverAddress.state')}</span>
          <input
            maxLength={2}
            onChange={(event) => change('state', event.target.value.toUpperCase())}
            value={fields.state}
          />
        </label>
      </div>
      {text === '' ? null : (
        <p className={styles.hint}>
          {t('occurrenceDetail.driverAddress.preview', { address: text })}
        </p>
      )}
      <div className={styles.driverAddressActions}>
        <Button
          disabled={text.length === 0 || isBusy}
          onClick={() => void send('app')}
          size="sm"
          type="button"
        >
          <Icon name="send" />
          {t(
            app.isPending || point.isPending
              ? 'occurrenceDetail.driverAddress.sending'
              : 'occurrenceDetail.driverAddress.sendApp',
          )}
        </Button>
        <Button
          disabled={text.length === 0 || isBusy}
          onClick={() => void send('whatsapp')}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Icon name="message" />
          {t(
            whatsapp.isPending || point.isPending
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
