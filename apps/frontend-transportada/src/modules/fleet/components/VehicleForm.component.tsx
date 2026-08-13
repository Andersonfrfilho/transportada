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
import { VehicleOperationFields } from './VehicleOperationFields.component'
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void form.submit()
  }

  return (
    <form className={styles.panel} onSubmit={handleSubmit}>
      <h2>{vehicle === undefined ? t('newVehicle') : t('editVehicle')}</h2>
      <VehicleIdentityFields
        lookup={{
          canLookupPlate: lookup.canLookupPlate,
          isLookingUpPlate: form.isLookingUpPlate,
          onLookupPlate: () => void form.lookupPlate(),
        }}
        state={form.state}
        onChange={form.patch}
      />
      <VehicleOperationFields state={form.state} onChange={form.patch} />
      <VehicleOwnerFields state={form.state} onChange={form.patch} />
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
