/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { FREIGHT_VEHICLE_CLASSES } from '@/modules/shared/freightClass.constant'

import { useFreightRegionForm } from '../hooks/useFreightRegionForm.hook'
import type {
  FreightRegion,
  FreightRegionBodyInput,
  FreightRegionUpdateInput,
} from '../shared/freightRegion.types'
import styles from '../styles/fleet.module.css'
import { FleetField, FleetMoneyField } from './FleetField.component'
import { FreightRegionCityField } from './FreightRegionCityField.component'

type FreightRegionFormProps = Readonly<{
  onCancel: () => void
  onCreate: (body: FreightRegionBodyInput) => Promise<unknown>
  onUpdate: (input: FreightRegionUpdateInput) => Promise<unknown>
  region?: FreightRegion
}>

/** O valor da classe é o que a transportadora paga ao motorista pela viagem, não o frete cobrado. */
export function FreightRegionForm({
  onCancel,
  onCreate,
  onUpdate,
  region,
}: FreightRegionFormProps) {
  const { t } = useTranslation('fleet')
  const form = useFreightRegionForm({
    onCreate,
    onSaved: onCancel,
    onUpdate,
    ...(region === undefined ? {} : { region }),
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void form.submit()
  }

  return (
    <form className={styles.panel} onSubmit={handleSubmit}>
      <h2>{region === undefined ? t('regionForm.newRegion') : t('regionForm.editRegion')}</h2>
      <div className={styles.fieldGrid}>
        <FleetField
          hint={t('regionForm.codeHint')}
          label={t('regionForm.code')}
          maxLength={5}
          value={form.state.code}
          onChange={(code) => form.patch({ code })}
        />
        <FleetField
          label={t('regionForm.name')}
          value={form.state.name}
          onChange={(name) => form.patch({ name })}
        />
      </div>
      <FreightRegionCityField
        cities={form.state.cities}
        onChange={(cities) => form.patch({ cities })}
      />
      <fieldset className={styles.fieldGroup}>
        <legend>{t('regionForm.rateLegend')}</legend>
        <small className={styles.fieldHint}>{t('regionForm.rateHint')}</small>
        <div className={cn(styles.fieldGrid, styles.rateGrid)}>
          {FREIGHT_VEHICLE_CLASSES.map((freightClass) => (
            <FleetMoneyField
              key={freightClass}
              label={t(`freightClass.${freightClass}`)}
              optional
              scale={2}
              value={form.state.rates[freightClass]}
              onChange={(value) => form.patchRate({ freightClass, value })}
            />
          ))}
        </div>
      </fieldset>
      {form.errors.length === 0 ? null : (
        <ul className={styles.feedback} role="alert">
          {form.errors.map((error) => (
            <li key={error}>{t(`regionForm.error.${error}`)}</li>
          ))}
        </ul>
      )}
      {form.feedbackKey === null ? null : (
        <p className={styles.feedback} role="status">
          {t(form.feedbackKey)}
        </p>
      )}
      <div className={styles.formActions}>
        <Button type="button" variant="ghost" onClick={onCancel}>
          <Icon name="close" />
          {t('cancel')}
        </Button>
        <Button disabled={form.isSaving} type="submit">
          <Icon name="save" />
          {t('save')}
        </Button>
      </div>
    </form>
  )
}
