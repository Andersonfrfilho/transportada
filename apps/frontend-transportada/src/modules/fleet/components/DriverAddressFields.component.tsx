/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { DriverAddressLookupController } from '../hooks/useDriverAddressLookup.hook'
import { BRAZIL_STATE, type FleetDriverFormState } from '../shared/fleet.types'
import styles from '../styles/fleet.module.css'
import { DriverCityField } from './DriverCityField.component'
import { FleetField, FleetSelectField } from './FleetField.component'

type DriverAddressFieldsProps = Readonly<{
  lookup: DriverAddressLookupController
  onChange: (values: Partial<FleetDriverFormState>) => void
  state: FleetDriverFormState
}>

export function DriverAddressFields({ lookup, onChange, state }: DriverAddressFieldsProps) {
  const { t } = useTranslation('fleet')

  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('driverAddressLegend')}</legend>
      <p className={styles.hint}>{t('driverAddressHint')}</p>
      <div className={styles.fieldGrid}>
        <FleetField
          hint={t('driverAddressPostalCodeHint')}
          inputMode="numeric"
          label={t('driverAddressPostalCode')}
          maxLength={9}
          optional
          value={state.addressPostalCode}
          onChange={lookup.changePostalCode}
        />
        <FleetField
          hint={t('driverAddressSearchHint')}
          label={t('driverAddressSearch')}
          optional
          value={lookup.searchTerm}
          onChange={lookup.changeSearchTerm}
        />
      </div>
      {lookup.statusKey === null ? null : <p className={styles.hint}>{t(lookup.statusKey)}</p>}
      {lookup.isSearching ? <p className={styles.hint}>{t('driverAddressSearching')}</p> : null}
      {lookup.suggestions.length === 0 ? null : (
        <ul className={styles.addressSuggestionList}>
          {lookup.suggestions.map((suggestion) => (
            <li key={suggestion.label}>
              <button type="button" onClick={() => lookup.selectSuggestion(suggestion)}>
                {suggestion.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.fieldGrid}>
        <FleetField
          label={t('driverAddressStreet')}
          optional
          value={state.addressStreet}
          onChange={(addressStreet) => onChange({ addressStreet })}
        />
        <FleetField
          label={t('driverAddressNumber')}
          maxLength={20}
          optional
          value={state.addressNumber}
          onChange={(addressNumber) => onChange({ addressNumber })}
        />
        <FleetField
          label={t('driverAddressComplement')}
          optional
          value={state.addressComplement}
          onChange={(addressComplement) => onChange({ addressComplement })}
        />
        <FleetField
          label={t('driverAddressDistrict')}
          optional
          value={state.addressDistrict}
          onChange={(addressDistrict) => onChange({ addressDistrict })}
        />
        <FleetSelectField
          clearable
          label={t('driverAddressState')}
          optionLabelKey="stateOption"
          options={BRAZIL_STATE}
          placeholder={t('driverAddressStateUnset')}
          value={state.addressState}
          onChange={(addressState) => onChange({ addressState })}
        />
        <DriverCityField
          choices={lookup.cityChoices}
          hasState={lookup.hasCityState}
          isLoading={lookup.isLoadingCities}
          label={t('driverAddressCity')}
          value={state.addressCity}
          onChange={(addressCity) => onChange({ addressCity })}
        />
      </div>
      {lookup.mapUrl === null ? null : (
        <iframe
          className={styles.addressMap}
          loading="lazy"
          referrerPolicy="no-referrer"
          src={lookup.mapUrl}
          title={t('driverAddressMapTitle')}
        />
      )}
    </fieldset>
  )
}
