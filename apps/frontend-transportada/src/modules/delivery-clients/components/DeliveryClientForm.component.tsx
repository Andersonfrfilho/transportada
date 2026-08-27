/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'

import type { DeliveryClientDetail, DeliveryClientWrite } from '../shared/deliveryClients.types'
import styles from '../styles/deliveryClients.module.css'

type DeliveryClientFormProps = Readonly<{
  client: DeliveryClientDetail
  isDisabled: boolean
  onSave: (values: DeliveryClientWrite) => Promise<void>
}>

/**
 * Spec 060 D1: o que esta ficha edita é **regra**, não identidade. Documento e nome vêm da nota e
 * são só leitura — mudar o nome aqui seria discordar da próxima nota, que o sobrescreveria de novo.
 */
export function DeliveryClientForm({ client, isDisabled, onSave }: DeliveryClientFormProps) {
  const { t } = useTranslation('deliveryClients')
  const [requiresScheduling, setRequiresScheduling] = useState(client.requiresScheduling)
  const [deliveryFeeAmount, setDeliveryFeeAmount] = useState(client.deliveryFeeAmount ?? '')
  const [serviceTime, setServiceTime] = useState(
    client.defaultServiceTimeMinutes === null ? '' : String(client.defaultServiceTimeMinutes),
  )
  const [status, setStatus] = useState(client.status)
  const [notes, setNotes] = useState(client.notes)
  const [isSaving, setIsSaving] = useState(false)

  async function handleSubmit(): Promise<void> {
    setIsSaving(true)
    try {
      await onSave({
        /** Campo em branco é **ausência de regra**, e ausência é `null` — nunca zero. */
        defaultServiceTimeMinutes: serviceTime.trim() === '' ? null : Number(serviceTime),
        deliveryFeeAmount: deliveryFeeAmount.trim() === '' ? null : deliveryFeeAmount.trim(),
        notes,
        requiresScheduling,
        status,
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault()
        void handleSubmit()
      }}
    >
      <header className={styles.panelHeader}>
        <h3>{client.displayName === '' ? t('form.unnamed') : client.displayName}</h3>
        <p className={styles.hint}>{t('form.taxId', { taxId: client.taxId })}</p>
      </header>

      <Checkbox
        checked={requiresScheduling}
        disabled={isDisabled}
        label={t('form.requiresScheduling')}
        onChange={setRequiresScheduling}
      />
      <p className={styles.hint}>{t('form.requiresSchedulingHint')}</p>

      <label className={styles.field}>
        {t('form.deliveryFeeAmount')}
        <input
          disabled={isDisabled}
          inputMode="decimal"
          onChange={(event) => setDeliveryFeeAmount(event.target.value)}
          placeholder={t('form.deliveryFeeAmountPlaceholder')}
          value={deliveryFeeAmount}
        />
      </label>
      <p className={styles.hint}>{t('form.deliveryFeeAmountHint')}</p>

      <label className={styles.field}>
        {t('form.serviceTime')}
        <input
          disabled={isDisabled}
          inputMode="numeric"
          onChange={(event) => setServiceTime(event.target.value)}
          value={serviceTime}
        />
      </label>

      <label className={styles.field}>
        {t('form.status')}
        <Select
          ariaLabel={t('form.status')}
          disabled={isDisabled}
          onChange={(value) => setStatus(value === 'inactive' ? 'inactive' : 'active')}
          options={[
            { label: t('form.statusActive'), value: 'active' },
            { label: t('form.statusInactive'), value: 'inactive' },
          ]}
          value={status}
        />
      </label>

      <label className={styles.field}>
        {t('form.notes')}
        <textarea
          disabled={isDisabled}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          value={notes}
        />
      </label>

      <Button disabled={isDisabled || isSaving} type="submit">
        <Icon name="save" />
        {isSaving ? t('form.saving') : t('form.save')}
      </Button>
    </form>
  )
}
