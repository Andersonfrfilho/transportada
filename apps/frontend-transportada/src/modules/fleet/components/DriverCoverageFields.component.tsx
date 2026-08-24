/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FilterPills, type FilterPill } from '@/components/ui/filter-pills'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'

import {
  DRIVER_COVERAGE_ALL_REGIONS_VALUE,
  describeDriverCoveragePills,
} from '../shared/driverCoverage.service'
import type { DriverCoverageController } from '../hooks/useDriverCoverage.hook'
import type { FreightRegion } from '../shared/freightRegion.types'
import styles from '../styles/fleet.module.css'

type DriverCoverageFieldsProps = Readonly<{
  coverage: DriverCoverageController
  regions: readonly FreightRegion[]
}>

export function DriverCoverageFields({ coverage, regions }: DriverCoverageFieldsProps) {
  const { t } = useTranslation('fleet')
  const [regionId, setRegionId] = useState('')
  const selectedRegion = regions.find((region) => region.id === regionId)

  const pills: readonly FilterPill[] = describeDriverCoveragePills(coverage.entries).map(
    (pill) => ({
      id: pill.key,
      label: t(pill.labelKey),
      onRemove: () => coverage.remove(pill.key),
      removeLabel: t('driverCoverage.remove'),
      value: pill.value,
    }),
  )

  /** Como a cidade, "todas as rotas" age na escolha — e volta ao placeholder: não é uma rota. */
  function chooseRegion(value: string): void {
    if (value !== DRIVER_COVERAGE_ALL_REGIONS_VALUE) {
      setRegionId(value)
      return
    }
    coverage.addAllRegions(regions)
    setRegionId('')
  }

  /** A cidade entra assim que é escolhida: um segundo botão só para confirmar não decide nada. */
  function addCity(city: string): void {
    const chosen = selectedRegion?.cities.find((option) => option.city === city)
    if (selectedRegion === undefined || chosen === undefined) return
    coverage.addCity({ city: chosen, region: selectedRegion })
  }

  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('driverCoverage.legend')}</legend>
      <p className={styles.hint}>{t('driverCoverage.hint')}</p>
      <div className={styles.fieldGrid}>
        <label>
          <span>{t('driverCoverage.region')}</span>
          <Select
            clearable
            emptyLabel={t('driverCoverage.regionsEmpty')}
            options={[
              ...(regions.length === 0
                ? []
                : [
                    {
                      label: t('driverCoverage.allRegions'),
                      value: DRIVER_COVERAGE_ALL_REGIONS_VALUE,
                    },
                  ]),
              ...regions.map((region) => ({
                label: `${region.code} ${region.name}`,
                value: region.id,
              })),
            ]}
            placeholder={t('driverCoverage.regionPlaceholder')}
            searchPlaceholder={t('driverCoverage.regionSearch')}
            value={regionId}
            onChange={chooseRegion}
          />
        </label>
        <label>
          <span>{t('driverCoverage.city')}</span>
          <Select
            disabled={selectedRegion === undefined}
            emptyLabel={t('driverCoverage.citiesEmpty')}
            options={(selectedRegion?.cities ?? []).map((city) => ({
              label: `${city.city}/${city.state}`,
              value: city.city,
            }))}
            placeholder={t('driverCoverage.cityPlaceholder')}
            searchPlaceholder={t('driverCoverage.citySearch')}
            value=""
            onChange={addCity}
          />
        </label>
      </div>
      <div className={styles.formActions}>
        <Button
          disabled={selectedRegion === undefined}
          type="button"
          variant="ghost"
          onClick={() => {
            if (selectedRegion !== undefined) coverage.addRegion(selectedRegion)
          }}
        >
          <Icon name="add" />
          {t('driverCoverage.addRegion')}
        </Button>
      </div>
      {coverage.entries.length === 0 ? (
        <p className={styles.hint}>{t('driverCoverage.empty')}</p>
      ) : (
        <FilterPills
          clearAllLabel={t('driverCoverage.clear')}
          pills={pills}
          onClearAll={coverage.clear}
        />
      )}
    </fieldset>
  )
}
