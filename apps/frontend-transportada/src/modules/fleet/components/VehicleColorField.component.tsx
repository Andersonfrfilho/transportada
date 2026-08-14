/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'

import { VEHICLE_COLOR_SWATCH } from '../shared/fleet.constant'
import { VEHICLE_COLOR, type VehicleColor } from '../shared/fleet.types'

type VehicleColorFieldProps = Readonly<{
  onChange: (value: '' | VehicleColor) => void
  value: '' | VehicleColor
}>

/** Não usa FleetSelectField porque só esta lista carrega quadrado de cor por opção. */
export function VehicleColorField({ onChange, value }: VehicleColorFieldProps) {
  const { t } = useTranslation('fleet')
  const label = t('color')

  return (
    <label>
      <span>{label}</span>
      <Select
        ariaLabel={label}
        clearable
        options={VEHICLE_COLOR.map((color) => ({
          label: t(`colorOption.${color}`),
          swatch: VEHICLE_COLOR_SWATCH[color],
          value: color,
        }))}
        placeholder={t('colorUnset')}
        value={value}
        onChange={(next) => onChange(next as '' | VehicleColor)}
      />
    </label>
  )
}
