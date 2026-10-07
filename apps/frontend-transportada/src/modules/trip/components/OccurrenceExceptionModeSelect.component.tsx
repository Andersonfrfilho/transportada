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
import type {
  OccurrenceRecordField,
  OccurrenceRequirementField,
} from '@/modules/trip/shared/occurrenceRequirement.constant'
import styles from '@/modules/trip/styles/occurrenceException.module.css'

const INHERIT = 'inherit'

type OccurrenceExceptionModeSelectProps = Readonly<{
  disabled: boolean
  field: OccurrenceRecordField | OccurrenceRequirementField
  /** O nome que o tipo deu ao campo (ex.: "Número da NFD"); sem ele vale o nome padrão. */
  label?: string
  /** `undefined` é a foto: declarada na exceção, sem a opção de herdar do tipo. */
  onChange: (mode: null | OccurrenceAttachmentMode) => void
  value: null | OccurrenceAttachmentMode | undefined
  canInherit?: boolean
}>

/** Os mesmos três estados do tipo, mais "Igual ao tipo" (nulo herda) — exceto a foto, que a exceção declara. */
export function OccurrenceExceptionModeSelect({
  canInherit = true,
  disabled,
  field,
  label: customLabel,
  onChange,
  value,
}: OccurrenceExceptionModeSelectProps) {
  const { t } = useTranslation('companySettings')
  const label = customLabel ?? t(`occurrenceTypeCatalog.requirements.fields.${field}`)
  const modeOptions = OCCURRENCE_ATTACHMENT_MODES.map((mode) => ({
    label: t(`occurrenceTypeCatalog.requirements.modes.${mode}`),
    value: mode,
  }))

  return (
    <div className={styles.field}>
      <span aria-hidden="true" className={styles.fieldLabel}>
        {label}
      </span>
      <Tooltip
        dismissOnActivate
        fill
        label={t(`occurrenceTypeCatalog.requirements.hints.${field}`)}
      >
        <Select
          ariaLabel={label}
          compact
          disabled={disabled}
          onChange={(next) =>
            onChange(next === INHERIT ? null : (next as OccurrenceAttachmentMode))
          }
          options={
            canInherit
              ? [
                  { label: t('occurrenceTypeCatalog.exceptions.inheritMode'), value: INHERIT },
                  ...modeOptions,
                ]
              : modeOptions
          }
          value={value ?? INHERIT}
        />
      </Tooltip>
    </div>
  )
}
