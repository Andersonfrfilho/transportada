/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'
import { Tooltip } from '@/components/ui/tooltip'
import {
  OCCURRENCE_ITEMS_WRITE_MODES,
  type OccurrenceItemsWriteMode,
} from '@/modules/trip/shared/occurrence.constant'

export type OccurrenceTypeItemsModeSelectProps = Readonly<{
  disabled?: boolean
  onChange: (mode: OccurrenceItemsWriteMode) => void
  value: OccurrenceItemsWriteMode
}>

const LABEL_KEY_BY_MODE = {
  off: 'occurrenceTypeCatalog.itemsModeOff',
  optional: 'occurrenceTypeCatalog.itemsModeOptional',
} as const satisfies Record<OccurrenceItemsWriteMode, string>

/** Spec 241 RF10: Produtos do tipo — Desligado ou Opcional (`required` é da 239, não se escreve aqui). */
export function OccurrenceTypeItemsModeSelect({
  disabled = false,
  onChange,
  value,
}: OccurrenceTypeItemsModeSelectProps) {
  const { t } = useTranslation('companySettings')

  return (
    <Tooltip label={t('occurrenceTypeCatalog.itemsModeHint')}>
      <Select
        ariaLabel={t('occurrenceTypeCatalog.itemsMode')}
        disabled={disabled}
        onChange={(next) => onChange(next as OccurrenceItemsWriteMode)}
        options={OCCURRENCE_ITEMS_WRITE_MODES.map((mode) => ({
          label: t(LABEL_KEY_BY_MODE[mode]),
          value: mode,
        }))}
        value={value}
      />
    </Tooltip>
  )
}
