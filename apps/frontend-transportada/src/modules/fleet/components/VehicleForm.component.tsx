/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { useVehicleForm } from '../hooks/useVehicleForm.hook'
import type { VehicleLookupController } from '../hooks/useVehicleLookup.hook'
import type {
  FleetVehicleBody,
  FleetVehicleDetail,
  FleetVehicleVersionInput,
} from '../shared/fleet.types'
import styles from '../styles/fleet.module.css'
import { VehicleIdentityFields } from './VehicleIdentityFields.component'
import { VehicleOwnerFields } from './VehicleOwnerFields.component'

type VehicleFormProps = Readonly<{
  lookup: VehicleLookupController
  onCancel: () => void
  onCreate: (body: FleetVehicleBody) => Promise<FleetVehicleDetail>
  onUpdate: (input: FleetVehicleBody & FleetVehicleVersionInput) => Promise<FleetVehicleDetail>
  vehicle?: FleetVehicleDetail
}>

export function VehicleForm({ lookup, onCancel, onCreate, onUpdate, vehicle }: VehicleFormProps) {
  const { t } = useTranslation('fleet')
  const form = useVehicleForm({
    lookup,
    onCreate,
    onUpdate,
    ...(vehicle === undefined ? {} : { vehicle }),
  })
  const canLookupPlate = lookup.canLookupPlate

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void form.submit()
  }

  return (
    <form className={styles.panel} onSubmit={handleSubmit}>
      <h2>{vehicle === undefined ? t('newVehicle') : t('editVehicle')}</h2>
      <VehicleIdentityFields state={form.state} onChange={form.patch} />
      {canLookupPlate ? (
        <div className={styles.lookupAction}>
          <Button
            disabled={form.isLookingUpPlate || form.state.plate === ''}
            type="button"
            variant="ghost"
            onClick={() => void form.lookupPlate()}
          >
            <Icon name="search" />
            {t('lookupPlate')}
          </Button>
          <p className={styles.lookupHint}>{t('lookupPlateHint')}</p>
        </div>
      ) : null}
      {form.state.ownership === 'own' ? null : (
        <VehicleOwnerFields state={form.state} onChange={form.patch} />
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
