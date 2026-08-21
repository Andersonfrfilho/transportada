/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { toDisplayPersonName } from '@/modules/shared/personName.service'

import { useMunicipalityChoices } from '../hooks/useMunicipalityChoices.hook'
import { BRAZIL_STATE, type FleetDriverFormState } from '../shared/fleet.types'
import styles from '../styles/fleet.module.css'
import { DriverCityField } from './DriverCityField.component'
import { FleetField, FleetSelectField } from './FleetField.component'

const NATIONALITY_MAX_LENGTH = 40
const PERSON_NAME_MAX_LENGTH = 60

type DriverPersonalFieldsProps = Readonly<{
  fetch?: typeof globalThis.fetch
  onChange: (values: Partial<FleetDriverFormState>) => void
  state: FleetDriverFormState
}>

/**
 * O que a CNH imprime e a ficha ainda não guardava. A UF vem antes da cidade em cada par porque é
 * ela que estreita a lista do IBGE — sem a UF escolhida, o município seria um select de 5.570 linhas.
 */
export function DriverPersonalFields({ fetch, onChange, state }: DriverPersonalFieldsProps) {
  const { t } = useTranslation('fleet')
  const birthCities = useMunicipalityChoices({
    city: state.birthCity,
    ...(fetch === undefined ? {} : { fetch }),
    state: state.birthState,
  })
  const licenseCities = useMunicipalityChoices({
    city: state.licenseIssuedCity,
    ...(fetch === undefined ? {} : { fetch }),
    state: state.licenseIssuedState,
  })

  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('driverPersonalLegend')}</legend>
      <div className={styles.fieldGrid}>
        <FleetField
          label={t('driverNationality')}
          maxLength={NATIONALITY_MAX_LENGTH}
          optional
          value={state.nationality}
          onChange={(nationality) => onChange({ nationality })}
        />
        <FleetSelectField
          clearable
          label={t('driverBirthState')}
          optionLabelKey="stateOption"
          options={BRAZIL_STATE}
          placeholder={t('driverBirthStateUnset')}
          value={state.birthState}
          onChange={(birthState) => onChange({ birthState })}
        />
        <DriverCityField
          choices={birthCities.choices}
          hasState={birthCities.hasState}
          isLoading={birthCities.isLoading}
          label={t('driverBirthCity')}
          value={state.birthCity}
          onChange={(birthCity) => onChange({ birthCity })}
        />
        <FleetField
          label={t('driverFatherName')}
          maxLength={PERSON_NAME_MAX_LENGTH}
          optional
          value={state.fatherName}
          onChange={(fatherName) => onChange({ fatherName: toDisplayPersonName(fatherName) })}
        />
        <FleetField
          label={t('driverMotherName')}
          maxLength={PERSON_NAME_MAX_LENGTH}
          optional
          value={state.motherName}
          onChange={(motherName) => onChange({ motherName: toDisplayPersonName(motherName) })}
        />
        <FleetSelectField
          clearable
          label={t('driverLicenseIssuedState')}
          optionLabelKey="stateOption"
          options={BRAZIL_STATE}
          placeholder={t('driverLicenseIssuedStateUnset')}
          value={state.licenseIssuedState}
          onChange={(licenseIssuedState) => onChange({ licenseIssuedState })}
        />
        <DriverCityField
          choices={licenseCities.choices}
          hasState={licenseCities.hasState}
          isLoading={licenseCities.isLoading}
          label={t('driverLicenseIssuedCity')}
          value={state.licenseIssuedCity}
          onChange={(licenseIssuedCity) => onChange({ licenseIssuedCity })}
        />
      </div>
      <p className={styles.hint}>{t('driverPersonalHint')}</p>
    </fieldset>
  )
}
