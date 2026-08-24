/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select'

import type { FleetVehicleDetail } from '../shared/fleet.types'
import styles from '../styles/fleet.module.css'

type DriverVehicleLinkFieldProps = Readonly<{
  onChange: (vehicleIds: readonly string[]) => void
  options: readonly FleetVehicleDetail[]
  ownedVehicleIds: readonly string[]
  selectedVehicleIds: readonly string[]
}>

/**
 * A frota cresce e a ficha não pode crescer com ela: uma grade com uma caixa por veículo empurrava
 * o resto do formulário para fora da tela. O painel guarda a lista; a tela mostra o que foi escolhido.
 */
export function DriverVehicleLinkField({
  onChange,
  options,
  ownedVehicleIds,
  selectedVehicleIds,
}: DriverVehicleLinkFieldProps): JSX.Element {
  const { t } = useTranslation('fleet')

  function toOption(vehicle: FleetVehicleDetail): MultiSelectOption {
    const parts = [
      [vehicle.brand, vehicle.model].filter((part) => part !== '').join(' '),
      t(`roleOption.${vehicle.role}`),
      ownedVehicleIds.includes(vehicle.id) ? t('driverOwnedVehicle') : '',
    ].filter((part) => part !== '')
    return { description: parts.join(' · '), label: vehicle.plate, value: vehicle.id }
  }

  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('driverVehiclesLegend')}</legend>
      <p className={styles.hint}>{t('driverVehiclesHint')}</p>
      {options.length === 0 ? (
        <p className={styles.hint}>{t('driverVehiclesEmpty')}</p>
      ) : (
        <MultiSelect
          ariaLabel={t('driverVehiclesLegend')}
          clearAllLabel={t('driverVehiclesClearAll')}
          emptyLabel={t('driverVehiclesNoMatch')}
          onChange={onChange}
          options={options.map(toOption)}
          placeholder={t('driverVehiclesPlaceholder')}
          removeLabel={t('driverVehiclesRemove')}
          searchPlaceholder={t('driverVehiclesSearch')}
          summaryLabel={(count) => t('driverVehiclesSummary', { count })}
          values={selectedVehicleIds}
        />
      )}
    </fieldset>
  )
}
