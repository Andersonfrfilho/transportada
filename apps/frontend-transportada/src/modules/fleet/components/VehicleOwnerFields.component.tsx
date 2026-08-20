/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { formatTaxId, normalizeTaxId } from '@/modules/shared/taxId.service'

import {
  FLEET_VEHICLE_OWNERSHIP,
  MDFE_OWNER_TAX_REGIME,
  type FleetDriverBody,
  type FleetDriverDetail,
  type FleetVehicleFormState,
} from '../shared/fleet.types'
import styles from '../styles/fleet.module.css'
import { DriverQuickCreateDialog } from './DriverQuickCreateDialog.component'
import { FleetField, FleetSelectField } from './FleetField.component'

type VehicleOwnerFieldsProps = Readonly<{
  drivers: readonly FleetDriverDetail[]
  onChange: (values: Partial<FleetVehicleFormState>) => void
  onCreateDriver: (body: FleetDriverBody) => Promise<FleetDriverDetail>
  state: FleetVehicleFormState
}>

export function VehicleOwnerFields({
  drivers,
  onChange,
  onCreateDriver,
  state,
}: VehicleOwnerFieldsProps) {
  const { t } = useTranslation('fleet')
  const [isCreatingDriver, setIsCreatingDriver] = useState(false)
  const selectedDriverId =
    drivers.find((driver) => driver.taxId !== '' && driver.taxId === state.ownerTaxId)?.id ?? ''

  function applyDriver(driverId: string): void {
    const driver = drivers.find((candidate) => candidate.id === driverId)
    if (driver === undefined) return
    onChange({ ownerName: driver.name, ownerTaxId: driver.taxId })
  }

  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('vehicleOwnershipLegend')}</legend>
      <div className={styles.fieldGrid}>
        <FleetSelectField
          label={t('ownership')}
          optionLabelKey="ownershipOption"
          options={FLEET_VEHICLE_OWNERSHIP}
          value={state.ownership}
          onChange={(ownership) => onChange({ ownership })}
        />
      </div>
      {state.ownership === 'own' ? null : (
        <>
          <p className={styles.hint}>{t('vehicleOwnerHint')}</p>
          <p className={styles.hint}>{t('ownerDriverPickerHint')}</p>
          <div className={styles.fieldGrid}>
            <SearchableSelect
              ariaLabel={t('ownerDriverPicker')}
              emptyLabel={t('ownerDriverPickerEmpty')}
              onChange={applyDriver}
              options={drivers.map((driver) => ({
                label: `${driver.name} — ${formatTaxId(driver.taxId)}`,
                value: driver.id,
              }))}
              placeholder={t('ownerDriverPickerPlaceholder')}
              searchPlaceholder={t('ownerDriverPickerSearchPlaceholder')}
              value={selectedDriverId}
            />
          </div>
          <div className={styles.formActions}>
            <Button onClick={() => setIsCreatingDriver(true)} type="button" variant="secondary">
              <Icon name="add" />
              {t('ownerDriverCreateButton')}
            </Button>
          </div>
          <div className={styles.fieldGrid}>
            <FleetField
              label={t('ownerName')}
              value={state.ownerName}
              onChange={(ownerName) => onChange({ ownerName })}
            />
            <FleetField
              label={t('ownerTaxId')}
              maxLength={18}
              value={formatTaxId(state.ownerTaxId)}
              onChange={(ownerTaxId) => onChange({ ownerTaxId: normalizeTaxId(ownerTaxId) })}
            />
            <FleetField
              inputMode="numeric"
              label={t('ownerRntrc')}
              maxLength={9}
              value={state.ownerRntrc}
              onChange={(ownerRntrc) => onChange({ ownerRntrc })}
            />
            <FleetField
              label={t('ownerState')}
              maxLength={2}
              value={state.ownerState}
              onChange={(ownerState) => onChange({ ownerState })}
            />
            <FleetSelectField
              label={t('ownerTaxRegime')}
              optionLabelKey="ownerTaxRegimeOption"
              options={MDFE_OWNER_TAX_REGIME}
              value={state.ownerTaxRegime}
              onChange={(ownerTaxRegime) => onChange({ ownerTaxRegime })}
            />
          </div>
        </>
      )}
      {isCreatingDriver ? (
        <DriverQuickCreateDialog
          onClose={() => setIsCreatingDriver(false)}
          onCreate={onCreateDriver}
          onCreated={(driver) => {
            onChange({ ownerName: driver.name, ownerTaxId: driver.taxId })
            setIsCreatingDriver(false)
          }}
        />
      ) : null}
    </fieldset>
  )
}
