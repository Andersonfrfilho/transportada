/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { VehicleCatalogController } from '../hooks/useVehicleCatalog.hook'
import { useVehicleForm } from '../hooks/useVehicleForm.hook'
import type {
  FleetDriverBody,
  FleetDriverDetail,
  FleetVehicleBody,
  FleetVehicleDetail,
  FleetVehicleVersionInput,
} from '../shared/fleet.types'
import { resolveFormFuelPrice } from '../shared/fleetVehicleCost.service'
import styles from '../styles/fleet.module.css'
import { VehicleCostFields } from './VehicleCostFields.component'
import { VehicleIdentityFields } from './VehicleIdentityFields.component'
import { VehicleModelFields } from './VehicleModelFields.component'
import { VehicleOperationFields } from './VehicleOperationFields.component'
import { VehicleOwnerFields } from './VehicleOwnerFields.component'

type VehicleFormProps = Readonly<{
  catalog: VehicleCatalogController
  drivers: readonly FleetDriverDetail[]
  onCancel: () => void
  onCreate: (body: FleetVehicleBody) => Promise<FleetVehicleDetail>
  onCreateDriver: (body: FleetDriverBody) => Promise<FleetDriverDetail>
  onUpdate: (input: FleetVehicleBody & FleetVehicleVersionInput) => Promise<FleetVehicleDetail>
  vehicles: readonly FleetVehicleDetail[]
  vehicle?: FleetVehicleDetail
}>

export function VehicleForm({
  catalog,
  drivers,
  onCancel,
  onCreate,
  onCreateDriver,
  onUpdate,
  vehicle,
  vehicles,
}: VehicleFormProps) {
  const { t } = useTranslation('fleet')
  const form = useVehicleForm({
    onCreate,
    onSaved: onCancel,
    onUpdate,
    vehicles,
    ...(vehicle === undefined ? {} : { vehicle }),
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void form.submit()
  }

  return (
    <form className={styles.panel} onSubmit={handleSubmit}>
      <h2>{vehicle === undefined ? t('newVehicle') : t('editVehicle')}</h2>
      <VehicleIdentityFields state={form.state} onChange={form.patch} />
      <VehicleModelFields
        catalog={catalog}
        state={form.state}
        vehicles={vehicles}
        onChange={form.patch}
      />
      <VehicleOperationFields state={form.state} onChange={form.patch} />
      <VehicleOwnerFields
        drivers={drivers}
        state={form.state}
        onChange={form.patch}
        onCreateDriver={onCreateDriver}
      />
      <VehicleCostFields
        costsUpdatedAt={vehicle?.costsUpdatedAt ?? null}
        fuelPrice={resolveFormFuelPrice({ selectedFuelType: form.state.fuelType, vehicle })}
        state={form.state}
        onChange={form.patch}
      />
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
