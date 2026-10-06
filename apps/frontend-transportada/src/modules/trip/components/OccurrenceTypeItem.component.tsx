/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useId, useState } from 'react'

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
  isSaving: boolean
  onSave: (input: OccurrenceTypeSaveInput) => void
  templates: OccurrenceEmailTemplatesState
  type: OccurrenceType
}>

/** Spec 246 RF11: o tipo nasce recolhido; o operador abre só os que quer ver. */
export function OccurrenceTypeItem({
  canManage,
  exceptions,
  isSaving,
  onSave,
  templates,
  type,
}: OccurrenceTypeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const detailsId = useId()

  return (
    <article className={`${styles.item ?? ''} ${type.active ? '' : (styles.itemInactive ?? '')}`}>
      <OccurrenceTypeSummary
        controlsId={detailsId}
        exceptions={exceptions}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded((current) => !current)}
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
