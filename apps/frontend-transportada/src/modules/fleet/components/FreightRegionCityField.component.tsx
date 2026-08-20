/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FilterPills } from '@/components/ui/filter-pills'
import type { FilterPill } from '@/components/ui/filter-pills'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useFreightRegionCities } from '../hooks/useFreightRegionCities.hook'
import { BRAZIL_STATE } from '../shared/fleet.types'
import type { FreightRegionCity } from '../shared/freightRegion.types'
import { cityKeyOf } from '../shared/regionCityName.service'
import styles from '../styles/fleet.module.css'
import { FleetSelectField } from './FleetField.component'

const PASTE_ROWS = 4

type FreightRegionCityFieldProps = Readonly<{
  cities: readonly FreightRegionCity[]
  onChange: (cities: readonly FreightRegionCity[]) => void
}>

/**
 * A zona se monta por duas portas — escolher da lista do IBGE e colar a coluna da planilha — e as
 * duas caem na mesma grafia. O que não casou fica visível e nomeado logo abaixo: cidade descartada
 * em silêncio é frete que ninguém sabe que deixou de ser pago.
 */
export function FreightRegionCityField({ cities, onChange }: FreightRegionCityFieldProps) {
  const { t } = useTranslation('fleet')
  const entry = useFreightRegionCities({ cities, onChange })

  const pills: readonly FilterPill[] = cities.map((city) => ({
    id: cityKeyOf(city),
    label: city.city,
    onRemove: () => entry.removeCity(city),
    removeLabel: t('regionCities.remove', { city: city.city, state: city.state }),
    value: city.state,
  }))

  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('regionCities.legend')}</legend>
      <small className={styles.fieldHint}>{t('regionCities.hint')}</small>
      <div className={styles.fieldGrid}>
        <FleetSelectField
          clearable
          label={t('regionCities.state')}
          optionLabelKey="stateOption"
          options={BRAZIL_STATE}
          placeholder={t('regionCities.stateUnset')}
          value={entry.state}
          onChange={entry.changeState}
        />
        <label>
          <span>{t('regionCities.search')}</span>
          {entry.isLoadingCities ? (
            <SkeletonGroup label={t('loading')}>
              <Skeleton height="var(--field-height)" width="100%" />
            </SkeletonGroup>
          ) : (
            <Select
              ariaLabel={t('regionCities.search')}
              options={entry.cityChoices}
              placeholder={t('regionCities.searchUnset')}
              searchPlaceholder={t('regionCities.searchPlaceholder')}
              value=""
              onChange={entry.selectCity}
            />
          )}
          {entry.hasState ? null : (
            <small className={styles.fieldHint}>{t('regionCities.stateFirst')}</small>
          )}
          {entry.isListUnavailable ? (
            <small className={styles.fieldHint}>{t('regionCities.listUnavailable')}</small>
          ) : null}
        </label>
      </div>
      <label className={styles.cityPasteField}>
        <span>{t('regionCities.paste')}</span>
        <textarea
          placeholder={t('regionCities.pastePlaceholder')}
          rows={PASTE_ROWS}
          value={entry.pastedNames}
          onChange={(event) => entry.changePastedNames(event.target.value)}
        />
        <div className={styles.cityPasteActions}>
          <small className={styles.fieldHint}>{t('regionCities.pasteHint')}</small>
          <Button
            disabled={!entry.hasState || entry.pastedNames.trim() === ''}
            type="button"
            variant="ghost"
            onClick={entry.addPastedCities}
          >
            <Icon name="add" />
            {t('regionCities.pasteSubmit')}
          </Button>
        </div>
      </label>
      <FilterPills
        clearAllLabel={t('regionCities.clear')}
        pills={pills}
        onClearAll={entry.clearCities}
      />
      {entry.duplicated.length === 0 ? null : (
        <p className={styles.fieldHint} role="status">
          {t('regionCities.duplicated', { cities: entry.duplicated.join(', ') })}
        </p>
      )}
      {entry.unmatched.length === 0 ? null : (
        <div className={styles.cityUnmatched} role="status">
          <strong>{t('regionCities.unmatched')}</strong>
          <ul>
            {entry.unmatched.map((name, index) => (
              <li key={`${name}-${String(index)}`}>{name}</li>
            ))}
          </ul>
          <small className={styles.fieldHint}>{t('regionCities.unmatchedHint')}</small>
        </div>
      )}
    </fieldset>
  )
}
