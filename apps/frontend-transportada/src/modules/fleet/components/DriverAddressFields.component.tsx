/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { DriverAddressLookupController } from '../hooks/useDriverAddressLookup.hook'
import {
  BRAZIL_STATE,
  type DriverHomeReport,
  type FleetDriverFormState,
} from '../shared/fleet.types'
import { DriverHomeMap } from './DriverHomeMap.component'
import styles from '../styles/fleet.module.css'
import { DriverCityField } from './DriverCityField.component'
import { FleetField, FleetSelectField } from './FleetField.component'

type DriverAddressFieldsProps = Readonly<{
  /**
   * Spec 097 D6: onde a casa fica, para o mapa desenhar o ponto — e o aviso tomar o lugar dele
   * quando não há coordenada. Ausente é ficha nova, que ainda não foi salva nem procurada.
   */
  home?: Readonly<{
    latitude: null | string
    longitude: null | string
    report: DriverHomeReport
  }>
  lookup: DriverAddressLookupController
  onChange: (values: Partial<FleetDriverFormState>) => void
  state: FleetDriverFormState
  stateTriggerRef?: (element: HTMLButtonElement | null) => void
}>

export function DriverAddressFields({
  home,
  lookup,
  onChange,
  state,
  stateTriggerRef,
}: DriverAddressFieldsProps) {
  const { t } = useTranslation('fleet')

  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('driverAddressLegend')}</legend>
      <p className={styles.hint}>{t('driverAddressHint')}</p>
      {/*
        ⚠️ **A ADR-0037 tirou o mapa desta tela, e o adendo de 2026-09-08 o traz de volta por outro
        caminho.** O que ela removeu foi uma moldura embutida de terceiro, renderizando dentro da
        nossa página, e a CSP declara `frame-src 'none'` desde então. Este é o nosso basemap
        vetorial, servido da nossa origem, e ele existe para tornar a coordenada errada **visível**:
        medido, o provedor casou "Rua Sete de Setembro, 990, Pontal" em Guarulhos, a 250 km.

        Ficha nova ainda não tem o que desenhar nem o que avisar: a busca acontece ao salvar.
      */}
      {home === undefined ? null : (
        <DriverHomeMap
          home={home.report}
          labelOf={(key, values) => t(key, values ?? {})}
          latitude={home.latitude}
          longitude={home.longitude}
        />
      )}
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
          {...(stateTriggerRef === undefined ? {} : { triggerRef: stateTriggerRef })}
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
    </fieldset>
  )
}
