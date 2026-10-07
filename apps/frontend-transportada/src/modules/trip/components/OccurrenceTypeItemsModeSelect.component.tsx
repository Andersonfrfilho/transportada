/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'
import { Tooltip } from '@/components/ui/tooltip'
import {
  OCCURRENCE_ITEMS_MODE,
  type OccurrenceItemsWriteMode,
} from '@/modules/trip/shared/occurrence.constant'

export type OccurrenceTypeItemsModeSelectProps = Readonly<{
  disabled?: boolean
  onChange: (mode: OccurrenceItemsWriteMode) => void
  value: OccurrenceItemsWriteMode
}>

const CREATE_ITEMS_MODES = [OCCURRENCE_ITEMS_MODE.off, OCCURRENCE_ITEMS_MODE.optional] as const

const LABEL_KEY_BY_MODE = {
  [OCCURRENCE_ITEMS_MODE.off]: 'occurrenceTypeCatalog.itemsModeOff',
  [OCCURRENCE_ITEMS_MODE.optional]: 'occurrenceTypeCatalog.itemsModeOptional',
} as const satisfies Record<(typeof CREATE_ITEMS_MODES)[number], string>

/**
 * Spec 241 RF10: Produtos do **cadastro novo** — Desligado ou Opcional. O tipo já cadastrado usa o
 * seletor de três estados (`OccurrenceRequirementModeSelect`), que também escreve `required`.
 */
export function OccurrenceTypeItemsModeSelect({
  disabled = false,
  onChange,
  value,
}: OccurrenceTypeItemsModeSelectProps) {
  const { t } = useTranslation('companySettings')

  return (
    <Tooltip dismissOnActivate fill label={t('occurrenceTypeCatalog.itemsModeHint')}>
      <Select
        ariaLabel={t('occurrenceTypeCatalog.itemsMode')}
        disabled={disabled}
        onChange={(next) => onChange(next as OccurrenceItemsWriteMode)}
        options={CREATE_ITEMS_MODES.map((mode) => ({
          label: t(LABEL_KEY_BY_MODE[mode]),
          value: mode,
        }))}
        value={value}
      />
    </Tooltip>
  )
}
