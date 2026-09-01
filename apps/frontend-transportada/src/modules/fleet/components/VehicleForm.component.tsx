/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { DocumentIntakeDropZone } from '@/modules/document-intake/components/DocumentIntakeDropZone.component'
import { useRevealedPanel } from '@/modules/shared/useRevealedPanel.hook'

import type { VehicleCatalogController } from '../hooks/useVehicleCatalog.hook'
import { useVehicleForm } from '../hooks/useVehicleForm.hook'
import { useVehiclePlateMatch } from '../hooks/useVehiclePlateMatch.hook'
import type {
  FleetDriverBody,
  FleetDriverCreateBody,
  FleetDriverDetail,
  FleetDriverVersionInput,
  FleetVehicleBody,
  FleetVehicleDetail,
  FleetVehicleVersionInput,
} from '../shared/fleet.types'
import { isFleetFeedbackError } from '../shared/fleetFeedback.service'
import {
  resolveFormFuelPrice,
  resolveSecondaryFormFuelPrice,
} from '../shared/fleetVehicleCost.service'
import styles from '../styles/fleet.module.css'
import { FleetFeedback } from './FleetFeedback.component'
import { VehicleCostFields } from './VehicleCostFields.component'
import { VehicleIdentityFields } from './VehicleIdentityFields.component'
import { VehicleModelFields } from './VehicleModelFields.component'
import { VehicleOperationFields } from './VehicleOperationFields.component'
import { VehicleOwnerFields } from './VehicleOwnerFields.component'

type VehicleFormProps = Readonly<{
  catalog: VehicleCatalogController
  drivers: readonly FleetDriverDetail[]
  onCancel: () => void
  /** Spec 048 P2: a ficha que já existe se abre, em vez de o cadastro novo morrer na unicidade. */
  onEditVehicle: (vehicle: FleetVehicleDetail) => void
  onCreate: (body: FleetVehicleBody) => Promise<FleetVehicleDetail>
  onCreateDriver: (body: FleetDriverCreateBody) => Promise<FleetDriverDetail>
  onUpdateDriver: (input: FleetDriverBody & FleetDriverVersionInput) => Promise<FleetDriverDetail>
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
  onEditVehicle,
  onUpdateDriver,
  onUpdate,
  vehicle,
  vehicles,
}: VehicleFormProps) {
  const { t } = useTranslation('fleet')
  const { panelRef } = useRevealedPanel<HTMLFormElement>()
  const plateMatch = useVehiclePlateMatch()
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
    <form className={styles.panel} onSubmit={handleSubmit} ref={panelRef}>
      <h2>{vehicle === undefined ? t('newVehicle') : t('editVehicle')}</h2>
      <DocumentIntakeDropZone
        onApply={(result) => {
          form.applyDocument(result.values)
          if (vehicle === undefined) plateMatch.find(result.values.plate ?? '')
        }}
      />
      {plateMatch.match === null ? null : (
        <FleetFeedback isError={false}>
          {t('documentPlateTaken', { plate: plateMatch.match.plate })}
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              const existing = plateMatch.match
              plateMatch.dismiss()
              if (existing !== null) onEditVehicle(existing)
            }}
          >
            <Icon name="edit" />
            {t('documentPlateTakenAction')}
          </Button>
        </FleetFeedback>
      )}
      <VehicleIdentityFields
        documentFields={form.documentFields}
        state={form.state}
        onChange={form.patch}
      />
      <VehicleModelFields
        catalog={catalog}
        documentFields={form.documentFields}
        state={form.state}
        vehicles={vehicles}
        onChange={form.patch}
      />
      <VehicleOperationFields
        documentFields={form.documentFields}
        state={form.state}
        onChange={form.patch}
      />
      <VehicleOwnerFields
        drivers={drivers}
        state={form.state}
        onChange={form.patch}
        onCreateDriver={onCreateDriver}
        onUpdateDriver={onUpdateDriver}
      />
      <VehicleCostFields
        costsUpdatedAt={vehicle?.costsUpdatedAt ?? null}
        documentFields={form.documentFields}
        fuelPrice={resolveFormFuelPrice({ selectedFuelType: form.state.fuelType, vehicle })}
        secondaryFuelPrice={resolveSecondaryFormFuelPrice({
          selectedFuelType: form.state.secondaryFuelType,
          vehicle,
        })}
        state={form.state}
        onChange={form.patch}
      />
      {form.feedbackKey === null ? null : (
        <FleetFeedback isError={isFleetFeedbackError(form.feedbackKey)}>
          {t(form.feedbackKey)}
        </FleetFeedback>
      )}
      <div className={styles.formActions}>
        <Button type="button" variant="ghost" onClick={form.clear}>
          <Icon name="trash" />
          {t('clearForm')}
        </Button>
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
