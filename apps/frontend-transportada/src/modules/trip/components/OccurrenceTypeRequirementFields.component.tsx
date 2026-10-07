/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import type {
  OccurrenceAttachmentMode,
  OccurrenceType,
} from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceRequirementField } from '@/modules/trip/shared/occurrenceRequirement.constant'
import {
  readOccurrenceRequirementMode,
  readOccurrenceRequirementScope,
} from '@/modules/trip/shared/occurrenceRequirementScope.service'
import type { OccurrenceTypeEdit } from '@/modules/trip/shared/occurrenceTypeUpdate.service'
import styles from '@/modules/trip/styles/occurrenceTypeRequirement.module.css'

import { OccurrenceRequirementModeSelect } from './OccurrenceRequirementModeSelect.component'
import { OccurrenceTypeMinimums } from './OccurrenceTypeMinimums.component'
import { OccurrenceTypeRecordFields } from './OccurrenceTypeRecordFields.component'

type OccurrenceTypeRequirementFieldsProps = Readonly<{
  disabled: boolean
  /** Spec 247 RF1: a última escolha pedia valor pago por linha sem produtos — foi impedida e a tela diz por quê. */
  hasAmountWithoutItems: boolean
  onEdit: (edit: OccurrenceTypeEdit) => void
  type: OccurrenceType
}>

function buildEdit(field: OccurrenceRequirementField, mode: OccurrenceAttachmentMode) {
  if (field === 'photo') return { attachmentMode: mode }
  if (field === 'note') return { noteMode: mode }
  if (field === 'signature') return { signatureMode: mode }
  return { itemsMode: mode }
}

/**
 * Spec 246 RF1a/RF1c/RF1c2: Foto, Observação, Assinatura e Produtos do tipo, no mesmo seletor de
 * três estados. Quais campos valem sai do conjunto de momentos (`readOccurrenceRequirementScope`), e
 * só aparece o que a listagem trouxe: API anterior aos campos não oferece o que recusaria.
 */
export function OccurrenceTypeRequirementFields({
  disabled,
  hasAmountWithoutItems,
  onEdit,
  type,
}: OccurrenceTypeRequirementFieldsProps) {
  const { t } = useTranslation('companySettings')
  const scope = readOccurrenceRequirementScope(type)
  const fields = scope.typeFields
  if (fields.length === 0) return null

  return (
    <section
      aria-label={t('occurrenceTypeCatalog.requirements.title')}
      className={styles.requirements}
    >
      <p className={styles.title}>
        {t('occurrenceTypeCatalog.requirements.title')}{' '}
        <span className={styles.scope}>· {t('occurrenceTypeCatalog.requirements.scope')}</span>
      </p>
      {scope.isMixed ? (
        <p className={styles.legend}>{t('occurrenceTypeCatalog.requirements.mixedScope')}</p>
      ) : null}
      {scope.isStopOnly ? (
        <p className={styles.legend}>{t('occurrenceTypeCatalog.requirements.stopOnlyScope')}</p>
      ) : null}
      <div className={styles.grid}>
        {fields.map((field) => (
          <OccurrenceRequirementModeSelect
            disabled={disabled}
            field={field}
            key={field}
            onChange={(mode) => onEdit(buildEdit(field, mode))}
            value={readOccurrenceRequirementMode(type, field)}
          />
        ))}
      </div>
      <OccurrenceTypeRecordFields
        disabled={disabled}
        fields={scope.recordFields}
        hasAmountWithoutItems={hasAmountWithoutItems}
        onEdit={onEdit}
        type={type}
      />
      <p className={styles.legend}>{t('occurrenceTypeCatalog.requirements.legend')}</p>
      <OccurrenceTypeMinimums
        disabled={disabled}
        hasPhotoMinimum={scope.hasPhotoMinimum}
        onEdit={onEdit}
        type={type}
      />
    </section>
  )
}
