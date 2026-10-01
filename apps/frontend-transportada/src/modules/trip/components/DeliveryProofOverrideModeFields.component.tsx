/* Copyright (c) 2026 Ada Technology. MIT License. */
import { PANEL_MODE_FIELDS, type PanelModeField } from '../shared/deliveryProofPanelFields.constant'
import type {
  DeliveryProofFieldMode,
  DeliveryProofFieldSettings,
} from '../shared/deliveryProofSettings.service'

import { DeliveryProofCargoMinimum } from './DeliveryProofCargoMinimum.component'
import { DeliveryProofModeSelect } from './DeliveryProofModeSelect.component'

export type DeliveryProofOverrideAccess = Readonly<{
  canManage: boolean
  isSaving: boolean
}>

type DeliveryProofOverrideModeFieldsProps = Readonly<{
  effective: DeliveryProofFieldSettings
  isDisabled: boolean
  onChangeCargoMinimum: (count: number) => void
  onChangeMode: (field: PanelModeField, mode: DeliveryProofFieldMode) => void
}>

export function DeliveryProofOverrideModeFields({
  effective,
  isDisabled,
  onChangeCargoMinimum,
  onChangeMode,
}: DeliveryProofOverrideModeFieldsProps) {
  return (
    <>
      {PANEL_MODE_FIELDS.map((field) => (
        <DeliveryProofModeSelect
          field={field}
          isDisabled={isDisabled}
          key={field}
          onChange={onChangeMode}
          value={effective[field]}
        />
      ))}
      <DeliveryProofCargoMinimum
        isDisabled={isDisabled}
        mode={effective.cargo}
        onChange={onChangeCargoMinimum}
        value={effective.cargoMinimumCount}
      />
    </>
  )
}
