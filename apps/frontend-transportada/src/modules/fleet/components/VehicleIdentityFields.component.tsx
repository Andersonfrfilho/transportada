/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { FleetVehicleFormState } from '../shared/fleet.types'
import styles from '../styles/fleet.module.css'
import { FleetField } from './FleetField.component'

type VehicleIdentityFieldsProps = Readonly<{
  lookup: Readonly<{
    canLookupPlate: boolean
    isLookingUpPlate: boolean
    onLookupPlate: () => void
  }>
  onChange: (values: Partial<FleetVehicleFormState>) => void
  state: FleetVehicleFormState
}>

export function VehicleIdentityFields({ lookup, onChange, state }: VehicleIdentityFieldsProps) {
  const { t } = useTranslation('fleet')

  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('vehicleIdentityLegend')}</legend>
      <div className={styles.plateRow}>
        <FleetField
          label={t('plate')}
          maxLength={8}
          value={state.plate}
          onChange={(plate) => onChange({ plate })}
        />
        {lookup.canLookupPlate ? (
          <Button
            disabled={lookup.isLookingUpPlate || state.plate === ''}
            type="button"
            variant="ghost"
            onClick={lookup.onLookupPlate}
          >
            <Icon name="search" />
            {t('lookupPlate')}
          </Button>
        ) : null}
      </div>
      {lookup.canLookupPlate ? <p className={styles.lookupHint}>{t('lookupPlateHint')}</p> : null}
      <div className={styles.fieldGrid}>
        <FleetField
          inputMode="numeric"
          label={t('renavam')}
          maxLength={11}
          value={state.renavam}
          onChange={(renavam) => onChange({ renavam })}
        />
        <FleetField
          label={t('vehicleState')}
          maxLength={2}
          value={state.state}
          onChange={(vehicleState) => onChange({ state: vehicleState })}
        />
      </div>
    </fieldset>
  )
}
