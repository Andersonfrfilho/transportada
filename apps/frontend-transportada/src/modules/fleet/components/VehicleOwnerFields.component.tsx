/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'
import { formatTaxId } from '@/modules/shared/taxId.service'

import { useDriverRegions } from '../hooks/useDriverRegions.hook'
import { useDriverVehicles } from '../hooks/useDriverVehicles.hook'
import {
  FLEET_VEHICLE_OWNERSHIP,
  type FleetDriverBody,
  type FleetDriverCreateBody,
  type FleetDriverDetail,
  type FleetDriverVersionInput,
  type FleetVehicleFormState,
} from '../shared/fleet.types'
import { type DriverFocusField } from '../shared/driverFieldFocus.service'
import {
  findVehicleOwnerDriver,
  listIncompleteVehicleOwnerFields,
  resolveVehicleOwnerFixField,
  toVehicleOwnerFields,
} from '../shared/vehicleOwner.service'
import styles from '../styles/fleet.module.css'
import { DriverQuickCreateDialog } from './DriverQuickCreateDialog.component'
import { FleetFeedback } from './FleetFeedback.component'
import { FleetSelectField } from './FleetField.component'

/** O diálogo abre por dois motivos, e o aviso ainda diz qual campo revelar quando abre por ele. */
type DriverDialogRequest = Readonly<{
  focusField?: DriverFocusField
  mode: 'create' | 'edit'
}>

type VehicleOwnerFieldsProps = Readonly<{
  drivers: readonly FleetDriverDetail[]
  onChange: (values: Partial<FleetVehicleFormState>) => void
  onCreateDriver: (body: FleetDriverCreateBody) => Promise<FleetDriverDetail>
  onUpdateDriver: (input: FleetDriverBody & FleetDriverVersionInput) => Promise<FleetDriverDetail>
  state: FleetVehicleFormState
}>

export function VehicleOwnerFields({
  drivers,
  onChange,
  onCreateDriver,
  onUpdateDriver,
  state,
}: VehicleOwnerFieldsProps) {
  const { t } = useTranslation('fleet')
  const authQuery = useAuthMeQuery()
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const [driverDialog, setDriverDialog] = useState<DriverDialogRequest | null>(null)
  const selectedDriver = findVehicleOwnerDriver({ drivers, ownerTaxId: state.ownerTaxId })
  const selectedDriverId = selectedDriver?.id ?? ''
  /** A ficha aberta aqui corrige motorista já gravado: cobertura e vínculos são os dele. */
  const editedDriverId = driverDialog?.mode === 'edit' ? selectedDriver?.id : undefined
  const driverRegions = useDriverRegions({
    ...(companyId === undefined ? {} : { companyId }),
    ...(editedDriverId === undefined ? {} : { driverId: editedDriverId }),
    permissions,
  })
  const driverVehicles = useDriverVehicles({
    ...(companyId === undefined ? {} : { companyId }),
    ...(editedDriverId === undefined ? {} : { driverId: editedDriverId }),
    permissions,
  })
  const incompleteOwnerFields = listIncompleteVehicleOwnerFields(state)
  const ownerFixField = resolveVehicleOwnerFixField(incompleteOwnerFields)

  function applyDriver(driverId: string): void {
    const driver = drivers.find((candidate) => candidate.id === driverId)
    if (driver === undefined) return
    onChange(toVehicleOwnerFields(driver))
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
          <div className={styles.driverPickerRow}>
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
            <Button
              disabled={selectedDriver === undefined}
              onClick={() => setDriverDialog({ mode: 'edit' })}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon name="edit" />
              {t('ownerDriverEditButton')}
            </Button>
            <Button
              onClick={() => setDriverDialog({ mode: 'create' })}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Icon name="add" />
              {t('ownerDriverCreateButton')}
            </Button>
          </div>
          {state.ownerTaxId === '' ? null : (
            <div className={styles.ownerSummary}>
              <h3>{t('ownerSummaryTitle')}</h3>
              <dl>
                <div>
                  <dt>{t('ownerName')}</dt>
                  <dd>{state.ownerName}</dd>
                </div>
                <div>
                  <dt>{t('ownerTaxId')}</dt>
                  <dd>{formatTaxId(state.ownerTaxId)}</dd>
                </div>
                <div>
                  <dt>{t('ownerRntrc')}</dt>
                  <dd>{state.ownerRntrc === '' ? t('ownerNotInformed') : state.ownerRntrc}</dd>
                </div>
                <div>
                  <dt>{t('ownerState')}</dt>
                  <dd>{state.ownerState === '' ? t('ownerNotInformed') : state.ownerState}</dd>
                </div>
                <div>
                  <dt>{t('ownerTaxRegime')}</dt>
                  <dd>{t(`ownerTaxRegimeOption.${state.ownerTaxRegime}`)}</dd>
                </div>
              </dl>
              {incompleteOwnerFields.length === 0 ? null : (
                <FleetFeedback isError>
                  {t('ownerIncompleteHint', {
                    fields: incompleteOwnerFields.map((field) => t(field)).join(', '),
                  })}{' '}
                  {selectedDriver === undefined ? (
                    t('ownerIncompleteUnknownDriver')
                  ) : (
                    <Button
                      size="sm"
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setDriverDialog({
                          ...(ownerFixField === undefined ? {} : { focusField: ownerFixField }),
                          mode: 'edit',
                        })
                      }
                    >
                      <Icon name="edit" />
                      {t('ownerIncompleteFixButton')}
                    </Button>
                  )}
                </FleetFeedback>
              )}
            </div>
          )}
        </>
      )}
      {driverDialog === null ? null : (
        <DriverQuickCreateDialog
          key={driverDialog.mode === 'edit' ? selectedDriverId : 'new-driver'}
          {...(driverDialog.mode === 'edit' && selectedDriver !== undefined
            ? { driver: selectedDriver }
            : {})}
          {...(driverDialog.focusField === undefined
            ? {}
            : { focusField: driverDialog.focusField })}
          onClose={() => setDriverDialog(null)}
          onCreate={onCreateDriver}
          onUpdate={onUpdateDriver}
          regions={driverRegions}
          vehicles={driverVehicles}
          onCreated={(driver) => {
            onChange(toVehicleOwnerFields(driver))
            setDriverDialog(null)
          }}
        />
      )}
    </fieldset>
  )
}
