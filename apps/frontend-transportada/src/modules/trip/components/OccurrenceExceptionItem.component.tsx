/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import {
  toExceptionKey,
  type OccurrenceExceptionEdit,
  type OccurrenceExceptionEntry,
  type OccurrenceExceptionKey,
} from '@/modules/trip/shared/occurrenceException.service'
import {
  formatExceptionSubject,
  type OccurrenceExceptionSubject,
} from '@/modules/trip/shared/occurrenceExceptionPeople.service'
import type { OccurrenceRecordLabels } from '@/modules/trip/shared/occurrenceRecordFields.service'
import type { OccurrenceRequirementScope } from '@/modules/trip/shared/occurrenceRequirementScope.service'
import styles from '@/modules/trip/styles/occurrenceException.module.css'

import { OccurrenceExceptionMinimums } from './OccurrenceExceptionMinimums.component'
import { OccurrenceExceptionModeSelect } from './OccurrenceExceptionModeSelect.component'

type OccurrenceExceptionItemProps = Readonly<{
  disabled: boolean
  entry: OccurrenceExceptionEntry
  onEdit: (key: OccurrenceExceptionKey, edit: OccurrenceExceptionEdit) => void
  onRemove: (key: OccurrenceExceptionKey) => void
  /** Spec 247 D8: os nomes que o tipo deu ao número e ao valor pago; `undefined` é API anterior aos campos. */
  recordLabels: OccurrenceRecordLabels | undefined
  /** O que o momento do tipo cobra: tipo só de parada declara só a foto. */
  scope: OccurrenceRequirementScope
  subject: OccurrenceExceptionSubject
}>

/** Uma exceção por linha, com os quatro modos e os dois mínimos editáveis; nulo herda do tipo (RF11). */
export function OccurrenceExceptionItem({
  disabled,
  entry,
  onEdit,
  onRemove,
  recordLabels,
  scope,
  subject,
}: OccurrenceExceptionItemProps) {
  const { t } = useTranslation('companySettings')
  const key = toExceptionKey(entry)
  const label = formatExceptionSubject(subject)
  const fields = scope.exceptionFields

  function handleEdit(edit: OccurrenceExceptionEdit) {
    onEdit(key, edit)
  }

  return (
    <li className={styles.entry}>
      <div className={styles.who}>
        <span className={styles.kind}>
          {t(
            `occurrenceTypeCatalog.exceptions.kind${key.kind === 'contractor' ? 'Contractor' : 'Recipient'}`,
          )}
        </span>
        <span>{label}</span>
      </div>
      <div className={styles.fields}>
        {fields.includes('photo') ? (
          <OccurrenceExceptionModeSelect
            canInherit={false}
            disabled={disabled}
            field="photo"
            onChange={(mode) => (mode === null ? undefined : handleEdit({ attachmentMode: mode }))}
            value={entry.attachmentMode}
          />
        ) : null}
        {fields.includes('note') ? (
          <OccurrenceExceptionModeSelect
            disabled={disabled}
            field="note"
            onChange={(mode) => handleEdit({ noteMode: mode })}
            value={entry.noteMode ?? null}
          />
        ) : null}
        {fields.includes('signature') ? (
          <OccurrenceExceptionModeSelect
            disabled={disabled}
            field="signature"
            onChange={(mode) => handleEdit({ signatureMode: mode })}
            value={entry.signatureMode ?? null}
          />
        ) : null}
        {fields.includes('items') ? (
          <OccurrenceExceptionModeSelect
            disabled={disabled}
            field="items"
            onChange={(mode) => handleEdit({ itemsMode: mode })}
            value={entry.itemsMode ?? null}
          />
        ) : null}
        {recordLabels !== undefined && scope.recordFields.includes('referenceNumber') ? (
          <OccurrenceExceptionModeSelect
            disabled={disabled}
            field="referenceNumber"
            label={recordLabels.referenceNumber}
            onChange={(mode) => handleEdit({ referenceNumberMode: mode })}
            value={entry.referenceNumberMode ?? null}
          />
        ) : null}
        {recordLabels !== undefined && scope.recordFields.includes('declaredAmount') ? (
          <OccurrenceExceptionModeSelect
            disabled={disabled}
            field="declaredAmount"
            label={recordLabels.declaredAmount}
            onChange={(mode) => handleEdit({ declaredAmountMode: mode })}
            value={entry.declaredAmountMode ?? null}
          />
        ) : null}
        <OccurrenceExceptionMinimums
          canExceptItems={fields.includes('items')}
          canExceptPhoto={scope.canExceptPhotoMinimum}
          disabled={disabled}
          entry={entry}
          onEdit={handleEdit}
        />
      </div>
      <div>
        <Button
          aria-label={t('occurrenceTypeCatalog.exceptions.removeOf', { name: label })}
          disabled={disabled}
          onClick={() => onRemove(key)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name="trash" />
          {t('occurrenceTypeCatalog.exceptions.remove')}
        </Button>
      </div>
    </li>
  )
}
