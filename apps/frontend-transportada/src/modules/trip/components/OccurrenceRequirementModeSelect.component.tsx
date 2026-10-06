/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'
import { Tooltip } from '@/components/ui/tooltip'
import {
  OCCURRENCE_ATTACHMENT_MODES,
  type OccurrenceAttachmentMode,
} from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceRequirementField } from '@/modules/trip/shared/occurrenceRequirement.constant'
import styles from '@/modules/trip/styles/occurrenceTypeRequirement.module.css'

export type OccurrenceRequirementModeSelectProps = Readonly<{
  disabled?: boolean
  field: OccurrenceRequirementField
  onChange: (mode: OccurrenceAttachmentMode) => void
  value: OccurrenceAttachmentMode
}>

/**
 * Spec 246 RF1a/RF1h: o seletor de três estados dos quatro campos de exigência. O significado de
 * cada estado por campo mora na dica (uma vez), nunca em palavras diferentes por campo.
 */
export function OccurrenceRequirementModeSelect({
  disabled = false,
  field,
  onChange,
  value,
}: OccurrenceRequirementModeSelectProps) {
  const { t } = useTranslation('companySettings')
  const label = t(`occurrenceTypeCatalog.requirements.fields.${field}`)

  return (
    <div className={styles.field}>
      <span aria-hidden="true" className={styles.fieldLabel}>
        {label}
      </span>
      <Tooltip dismissOnActivate label={t(`occurrenceTypeCatalog.requirements.hints.${field}`)}>
        <Select
          ariaLabel={label}
          disabled={disabled}
          onChange={(next) => onChange(next as OccurrenceAttachmentMode)}
          options={OCCURRENCE_ATTACHMENT_MODES.map((mode) => ({
            label: t(`occurrenceTypeCatalog.requirements.modes.${mode}`),
            value: mode,
          }))}
          value={value}
        />
      </Tooltip>
    </div>
  )
}
