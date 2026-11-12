/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'
import { Tooltip } from '@/components/ui/tooltip'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import {
  OCCURRENCE_MIN_WAIT_OFF,
  buildOccurrenceMinWaitEdit,
  buildOccurrenceStopEdit,
  hasOccurrenceMinWait,
  listOccurrenceMinWaitChoices,
  readOccurrenceStopFields,
  readOccurrenceStopMode,
} from '@/modules/trip/shared/occurrenceStopFields.service'
import type { OccurrenceTypeEdit } from '@/modules/trip/shared/occurrenceTypeUpdate.service'
import styles from '@/modules/trip/styles/occurrenceTypeRequirement.module.css'

import { OccurrenceRequirementModeSelect } from './OccurrenceRequirementModeSelect.component'

type OccurrenceTypeStopFieldsProps = Readonly<{
  disabled: boolean
  onEdit: (edit: OccurrenceTypeEdit) => void
  type: OccurrenceType
}>

/**
 * Spec 315 RF6: Localização e Horário de chegada no mesmo seletor de três estados dos outros campos, e a espera mínima
 * depois do "Cheguei" como escolha entre valores prontos. Só aparece no tipo com o momento "parada".
 */
export function OccurrenceTypeStopFields({
  disabled,
  onEdit,
  type,
}: OccurrenceTypeStopFieldsProps) {
  const { t } = useTranslation('companySettings')
  const fields = readOccurrenceStopFields(type)
  const hasMinWait = hasOccurrenceMinWait(type)
  if (fields.length === 0 && !hasMinWait) return null

  const minWaitLabel = t('occurrenceTypeCatalog.requirements.minWait.title')

  return (
    <div className={styles.grid}>
      {fields.map((field) => (
        <OccurrenceRequirementModeSelect
          disabled={disabled}
          field={field}
          key={field}
          onChange={(mode) => onEdit(buildOccurrenceStopEdit(type, field, mode))}
          value={readOccurrenceStopMode(type, field)}
        />
      ))}
      {hasMinWait ? (
        <div className={styles.field}>
          <span aria-hidden="true" className={styles.fieldLabel}>
            {minWaitLabel}
          </span>
          <Tooltip
            dismissOnActivate
            fill
            label={t('occurrenceTypeCatalog.requirements.minWait.hint')}
          >
            <Select
              ariaLabel={minWaitLabel}
              disabled={disabled}
              onChange={(value) => onEdit(buildOccurrenceMinWaitEdit(value))}
              options={[
                {
                  label: t('occurrenceTypeCatalog.requirements.minWait.off'),
                  value: OCCURRENCE_MIN_WAIT_OFF,
                },
                ...listOccurrenceMinWaitChoices(type).map((minutes) => ({
                  label: t('occurrenceTypeCatalog.requirements.minWait.option', { count: minutes }),
                  value: String(minutes),
                })),
              ]}
              value={
                type.minWaitAfterArrivalMinutes === null ||
                type.minWaitAfterArrivalMinutes === undefined
                  ? OCCURRENCE_MIN_WAIT_OFF
                  : String(type.minWaitAfterArrivalMinutes)
              }
            />
          </Tooltip>
        </div>
      ) : null}
    </div>
  )
}
