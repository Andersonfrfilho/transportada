/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useId } from 'react'

import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeExceptionsState } from '@/modules/trip/shared/occurrenceExceptionPeople.service'
import type { OccurrenceEmailTemplatesState } from '@/modules/trip/shared/occurrenceTemplate.service'
import styles from '@/modules/trip/styles/occurrenceTypeItem.module.css'

import type { OccurrenceTypeSaveInput } from '../shared/occurrenceTypeUpdate.service'
import { OccurrenceTypeRow } from './OccurrenceTypeRow.component'
import { OccurrenceTypeSummary } from './OccurrenceTypeSummary.component'

type OccurrenceTypeItemProps = Readonly<{
  canManage: boolean
  exceptions: OccurrenceTypeExceptionsState
  isExpanded: boolean
  isSaving: boolean
  onSave: (input: OccurrenceTypeSaveInput) => void
  onToggle: (typeId: string) => void
  templates: OccurrenceEmailTemplatesState
  type: OccurrenceType
}>

/** Spec 246 RF11: o tipo nasce recolhido; quem guarda a abertura é a lista, por id — gravar não o recolhe. */
export function OccurrenceTypeItem({
  canManage,
  exceptions,
  isExpanded,
  isSaving,
  onSave,
  onToggle,
  templates,
  type,
}: OccurrenceTypeItemProps) {
  const detailsId = useId()

  return (
    <article className={`${styles.item ?? ''} ${type.active ? '' : (styles.itemInactive ?? '')}`}>
      <OccurrenceTypeSummary
        controlsId={detailsId}
        exceptions={exceptions}
        isExpanded={isExpanded}
        onToggle={() => onToggle(type.id)}
        type={type}
      />
      {isExpanded ? (
        <div className={styles.details} id={detailsId}>
          <OccurrenceTypeRow
            canManage={canManage}
            exceptions={exceptions}
            isSaving={isSaving}
            onSave={onSave}
            templates={templates}
            type={type}
          />
        </div>
      ) : null}
    </article>
  )
}
