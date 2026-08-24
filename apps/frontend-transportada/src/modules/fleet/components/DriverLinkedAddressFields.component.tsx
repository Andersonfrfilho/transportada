/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { DriverLinkedAddressController } from '../hooks/useDriverLinkedAddress.hook'
import { BRAZIL_STATE, type FleetDriverFormState } from '../shared/fleet.types'
import styles from '../styles/fleet.module.css'
import { DriverCityField } from './DriverCityField.component'
import { FleetField, FleetSelectField } from './FleetField.component'

type DriverLinkedAddressFieldsProps = Readonly<{
  lookup: DriverLinkedAddressController
  onChange: (values: Partial<FleetDriverFormState>) => void
  state: FleetDriverFormState
}>

export function DriverLinkedAddressFields({
  lookup,
  onChange,
  state,
}: DriverLinkedAddressFieldsProps) {
  const { t } = useTranslation('fleet')

  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('driverLinkedAddressLegend')}</legend>
      <p className={styles.hint}>{t('driverLinkedAddressHint')}</p>
      <div className={styles.fieldGrid}>
        <FleetField
          hint={t('driverAddressPostalCodeHint')}
          inputMode="numeric"
          label={t('driverAddressPostalCode')}
          maxLength={9}
          optional
          value={state.linkedAddressPostalCode}
          onChange={lookup.changePostalCode}
        />
        <FleetField
          label={t('driverAddressStreet')}
          optional
          value={state.linkedAddressStreet}
          onChange={(linkedAddressStreet) => onChange({ linkedAddressStreet })}
        />
        <FleetField
          label={t('driverAddressNumber')}
          maxLength={20}
          optional
          value={state.linkedAddressNumber}
          onChange={(linkedAddressNumber) => onChange({ linkedAddressNumber })}
        />
        <FleetField
          label={t('driverAddressComplement')}
          optional
          value={state.linkedAddressComplement}
          onChange={(linkedAddressComplement) => onChange({ linkedAddressComplement })}
        />
        <FleetField
          label={t('driverAddressDistrict')}
          optional
          value={state.linkedAddressDistrict}
          onChange={(linkedAddressDistrict) => onChange({ linkedAddressDistrict })}
        />
        <FleetSelectField
          clearable
          label={t('driverAddressState')}
          optionLabelKey="stateOption"
          options={BRAZIL_STATE}
          placeholder={t('driverAddressStateUnset')}
          value={state.linkedAddressState}
          onChange={(linkedAddressState) => onChange({ linkedAddressState })}
        />
        <DriverCityField
          choices={lookup.cityChoices}
          hasState={lookup.hasCityState}
          isLoading={lookup.isLoadingCities}
          label={t('driverAddressCity')}
          value={state.linkedAddressCity}
          onChange={(linkedAddressCity) => onChange({ linkedAddressCity })}
        />
      </div>
      {lookup.statusKey === null ? null : <p className={styles.hint}>{t(lookup.statusKey)}</p>}
    </fieldset>
  )
}
