/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeExceptionsState } from '@/modules/trip/shared/occurrenceExceptionPeople.service'
import { readOccurrenceRequirementScope } from '@/modules/trip/shared/occurrenceRequirementScope.service'
import type { OccurrenceEmailTemplatesState } from '@/modules/trip/shared/occurrenceTemplate.service'
import styles from '@/modules/trip/styles/trip.module.css'

import {
  buildOccurrenceTypeUpdate,
  type OccurrenceTypeEdit,
  type OccurrenceTypeSaveInput,
} from '../shared/occurrenceTypeUpdate.service'
import { OccurrenceTypeExceptions } from './OccurrenceTypeExceptions.component'
import { OccurrenceTypeIdentity } from './OccurrenceTypeIdentity.component'
import { OccurrenceTypeMoments } from './OccurrenceTypeMoments.component'
import { OccurrenceTypeNotification } from './OccurrenceTypeNotification.component'
import { OccurrenceTypeRequirementFields } from './OccurrenceTypeRequirementFields.component'

type OccurrenceTypeRowProps = Readonly<{
  canManage: boolean
  exceptions: OccurrenceTypeExceptionsState
  isSaving: boolean
  onSave: (input: OccurrenceTypeSaveInput) => void
  templates: OccurrenceEmailTemplatesState
  type: OccurrenceType
}>

/** A ordem é a do preview: identificação, momentos, o que exige, notificação, exceções. */
export function OccurrenceTypeRow({
  canManage,
  exceptions,
  isSaving,
  onSave,
  templates,
  type,
}: OccurrenceTypeRowProps) {
  const isDisabled = !canManage || isSaving
  const scope = readOccurrenceRequirementScope(type)

  function handleEdit(edit: OccurrenceTypeEdit) {
    onSave(buildOccurrenceTypeUpdate(type, edit))
  }

  return (
    <div className={styles.occurrenceForm}>
      <OccurrenceTypeIdentity disabled={isDisabled} onEdit={handleEdit} type={type} />
      {type.moments === undefined ? null : (
        <OccurrenceTypeMoments disabled={isDisabled} moments={type.moments} onEdit={handleEdit} />
      )}
      <OccurrenceTypeRequirementFields disabled={isDisabled} onEdit={handleEdit} type={type} />
      <OccurrenceTypeNotification
        disabled={isDisabled}
        onEdit={handleEdit}
        templates={templates}
        type={type}
      />
      {/* Spec 246 RF11/RF11c: as exceções à vista em todo tipo que tem momento de rua — galpão e rua inclusive. */}
      {scope.hasExceptions ? (
        <OccurrenceTypeExceptions
          canManage={canManage}
          exceptions={exceptions}
          scope={scope}
          isDisabled={isSaving}
          occurrenceTypeId={type.id}
          typeAttachmentMode={type.attachmentMode}
        />
      ) : null}
    </div>
  )
}
