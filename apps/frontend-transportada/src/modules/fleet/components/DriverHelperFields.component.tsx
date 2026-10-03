/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { AMOUNT_DISPLAY_SCALE } from '@/modules/shared/decimalAmount.service'

import type { FleetDriverFormState } from '../shared/fleet.types'
import { isHelperOnlyDriver } from '../shared/fleetForm.service'
import styles from '../styles/fleet.module.css'
import { FleetMoneyField } from './FleetField.component'

type DriverHelperFieldsProps = Readonly<{
  onChange: (values: Partial<FleetDriverFormState>) => void
  state: FleetDriverFormState
}>

/**
 * Spec 235 D2: o ajudante puro sempre ajuda, então o interruptor aparece ligado e travado — a API
 * recusa desligá-lo (`FLEET_DRIVER_PROFILE_EMPTY`), e a tela nem oferece o gesto.
 */
export function DriverHelperFields({ onChange, state }: DriverHelperFieldsProps) {
  const { t } = useTranslation('fleet')
  const isHelperOnly = isHelperOnlyDriver(state)
  const canActAsHelper = isHelperOnly || state.canActAsHelper

  return (
    <>
      <div className={styles.driverSecuresCargo}>
        <Checkbox
          checked={canActAsHelper}
          disabled={isHelperOnly}
          label={t('driverCanActAsHelper')}
          onChange={(nextCanActAsHelper) => onChange({ canActAsHelper: nextCanActAsHelper })}
        />
        <p className={styles.hint}>
          {t(isHelperOnly ? 'driverHelperLockedHint' : 'driverCanActAsHelperHint')}
        </p>
      </div>
      {canActAsHelper ? (
        <FleetMoneyField
          hint={t('driverHelperDailyRateHint')}
          label={t('driverHelperDailyRate')}
          optional
          scale={AMOUNT_DISPLAY_SCALE}
          value={state.helperDailyRate}
          onChange={(helperDailyRate) => onChange({ helperDailyRate })}
        />
      ) : null}
    </>
  )
}
