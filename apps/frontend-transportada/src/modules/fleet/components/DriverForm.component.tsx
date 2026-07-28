/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { useDriverForm } from '../hooks/useDriverForm.hook'
import type {
  FleetDriverBody,
  FleetDriverDetail,
  FleetDriverVersionInput,
} from '../shared/fleet.types'
import styles from '../styles/fleet.module.css'
import { FleetField } from './FleetField.component'

type DriverFormProps = Readonly<{
  driver?: FleetDriverDetail
  onCancel: () => void
  onCreate: (body: FleetDriverBody) => Promise<FleetDriverDetail>
  onUpdate: (input: FleetDriverBody & FleetDriverVersionInput) => Promise<FleetDriverDetail>
}>

export function DriverForm({ driver, onCancel, onCreate, onUpdate }: DriverFormProps) {
  const { t } = useTranslation('fleet')
  const form = useDriverForm({
    onCreate,
    onUpdate,
    ...(driver === undefined ? {} : { driver }),
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void form.submit()
  }

  return (
    <form className={styles.panel} onSubmit={handleSubmit}>
      <h2>{driver === undefined ? t('newDriver') : t('editDriver')}</h2>
      <fieldset className={styles.fieldGroup}>
        <legend>{t('driverIdentityLegend')}</legend>
        <div className={styles.fieldGrid}>
          <FleetField
            label={t('driverName')}
            value={form.state.name}
            onChange={(name) => form.patch({ name })}
          />
          <FleetField
            inputMode="numeric"
            label={t('driverTaxId')}
            maxLength={11}
            value={form.state.taxId}
            onChange={(taxId) => form.patch({ taxId })}
          />
          <FleetField
            inputMode="numeric"
            label={t('driverLicense')}
            maxLength={11}
            value={form.state.licenseNumber}
            onChange={(licenseNumber) => form.patch({ licenseNumber })}
          />
          <FleetField
            inputMode="numeric"
            label={t('driverPhone')}
            maxLength={11}
            value={form.state.phone}
            onChange={(phone) => form.patch({ phone })}
          />
          <FleetField
            label={t('driverMembership')}
            maxLength={36}
            value={form.state.membershipId}
            onChange={(membershipId) => form.patch({ membershipId })}
          />
        </div>
        <p className={styles.hint}>{t('driverMembershipHint')}</p>
      </fieldset>
      {form.feedbackKey === null ? null : (
        <p className={styles.feedback} role="status">
          {t(form.feedbackKey)}
        </p>
      )}
      <div className={styles.formActions}>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button disabled={form.isSaving} type="submit">
          {t('save')}
        </Button>
      </div>
    </form>
  )
}
