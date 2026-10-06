/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TRIP_OCCURRENCE_STAGE } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeExceptionsState } from '@/modules/trip/shared/occurrenceExceptionPeople.service'
import type { OccurrenceEmailTemplatesState } from '@/modules/trip/shared/occurrenceTemplate.service'
import styles from '@/modules/trip/styles/occurrenceTypeItem.module.css'

import type { OccurrenceTypeSaveInput } from '../shared/occurrenceTypeUpdate.service'
import { OccurrenceTypeItem } from './OccurrenceTypeItem.component'

type OccurrenceTypeListProps = Readonly<{
  canManage: boolean
  exceptionsOf: (type: OccurrenceType) => OccurrenceTypeExceptionsState
  isSaving: boolean
  onSave: (input: OccurrenceTypeSaveInput) => void
  templates: OccurrenceEmailTemplatesState
  types: readonly OccurrenceType[]
}>

/** Os tipos agrupados por onde acontecem: galpão (`trip.manage`) e rua (`trip.report`). */
export function OccurrenceTypeList({
  canManage,
  exceptionsOf,
  isSaving,
  onSave,
  templates,
  types,
}: OccurrenceTypeListProps) {
  const { t } = useTranslation('companySettings')
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set())

  function handleToggle(typeId: string) {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (!next.delete(typeId)) next.add(typeId)
      return next
    })
  }

  return (
    <>
      {[TRIP_OCCURRENCE_STAGE.separation, TRIP_OCCURRENCE_STAGE.delivery].map((group) => {
        const groupTypes = types.filter((type) => type.stage === group)
        if (groupTypes.length === 0) return null

        return (
          <fieldset className={styles.group} key={group}>
            <legend className={styles.groupTitle}>
              {group === TRIP_OCCURRENCE_STAGE.separation
                ? t('occurrenceTypeCatalog.stageSeparation')
                : t('occurrenceTypeCatalog.stageDelivery')}
            </legend>
            {groupTypes.map((type) => (
              <OccurrenceTypeItem
                canManage={canManage}
                exceptions={exceptionsOf(type)}
                isExpanded={expandedIds.has(type.id)}
                isSaving={isSaving}
                key={type.id}
                onSave={onSave}
                onToggle={handleToggle}
                templates={templates}
                type={type}
              />
            ))}
          </fieldset>
        )
      })}
    </>
  )
}
