/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import {
  OCCURRENCE_ITEMS_MODE,
  TRIP_OCCURRENCE_STAGE,
  type OccurrenceAttachmentMode,
  type OccurrenceType,
} from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceRequirementField } from '@/modules/trip/shared/occurrenceRequirement.constant'
import type { OccurrenceTypeEdit } from '@/modules/trip/shared/occurrenceTypeUpdate.service'
import styles from '@/modules/trip/styles/occurrenceTypeRequirement.module.css'

import { OccurrenceRequirementModeSelect } from './OccurrenceRequirementModeSelect.component'
import { OccurrenceTypeMinimums } from './OccurrenceTypeMinimums.component'

type OccurrenceTypeRequirementFieldsProps = Readonly<{
  disabled: boolean
  onEdit: (edit: OccurrenceTypeEdit) => void
  type: OccurrenceType
}>

function readCurrentMode(type: OccurrenceType, field: OccurrenceRequirementField) {
  if (field === 'photo') return type.attachmentMode
  if (field === 'note') return type.noteMode
  if (field === 'signature') return type.signatureMode
  return type.itemsMode ?? OCCURRENCE_ITEMS_MODE.optional
}

function buildEdit(field: OccurrenceRequirementField, mode: OccurrenceAttachmentMode) {
  if (field === 'photo') return { attachmentMode: mode }
  if (field === 'note') return { noteMode: mode }
  if (field === 'signature') return { signatureMode: mode }
  return { itemsMode: mode }
}

/**
 * Spec 246 RF1a/RF1c/RF1c2: Foto, Observação, Assinatura e Produtos do tipo, no mesmo seletor de
 * três estados. Foto, Observação e Assinatura são do motorista na rua — o tipo de galpão tem a
 * regra fixa da 161 e não os mostra. Produtos vale para os dois, e só aparece quando a listagem
 * trouxe `itemsMode` (API anterior ao campo não oferece o controle).
 */
export function OccurrenceTypeRequirementFields({
  disabled,
  onEdit,
  type,
}: OccurrenceTypeRequirementFieldsProps) {
  const { t } = useTranslation('companySettings')
  const isDelivery = type.stage === TRIP_OCCURRENCE_STAGE.delivery
  const fields: readonly OccurrenceRequirementField[] = [
    ...(isDelivery ? (['photo', 'note', 'signature'] as const) : []),
    ...(type.itemsMode === undefined ? [] : (['items'] as const)),
  ]
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
      <div className={styles.grid}>
        {fields.map((field) => (
          <OccurrenceRequirementModeSelect
            disabled={disabled}
            field={field}
            key={field}
            onChange={(mode) => onEdit(buildEdit(field, mode))}
            value={readCurrentMode(type, field)}
          />
        ))}
      </div>
      <p className={styles.legend}>{t('occurrenceTypeCatalog.requirements.legend')}</p>
      <OccurrenceTypeMinimums disabled={disabled} onEdit={onEdit} type={type} />
    </section>
  )
}
