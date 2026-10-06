/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import { TRIP_OCCURRENCE_STAGE } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeExceptionsState } from '@/modules/trip/shared/occurrenceExceptionPeople.service'
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
  const isDelivery = type.stage === TRIP_OCCURRENCE_STAGE.delivery

  function handleEdit(edit: OccurrenceTypeEdit) {
    onSave(buildOccurrenceTypeUpdate(type, edit))
  }

  return (
    <div className={styles.occurrenceForm}>
      <OccurrenceTypeIdentity disabled={isDisabled} onEdit={handleEdit} type={type} />
      {type.moments === undefined ? null : (
        <OccurrenceTypeMoments
          disabled={isDisabled}
          key={type.moments.join(',')}
          moments={type.moments}
          onEdit={handleEdit}
        />
      )}
      <OccurrenceTypeRequirementFields disabled={isDisabled} onEdit={handleEdit} type={type} />
      <OccurrenceTypeNotification
        disabled={isDisabled}
        onEdit={handleEdit}
        templates={templates}
        type={type}
      />
      {/* Spec 246 RF11/RF11c: as exceções à vista, só em tipo de rua (mesmo gate do comprovante). */}
      {isDelivery ? (
        <OccurrenceTypeExceptions
          canManage={canManage}
          exceptions={exceptions}
          isDisabled={isSaving}
          occurrenceTypeId={type.id}
          typeAttachmentMode={type.attachmentMode}
        />
      ) : null}
    </div>
  )
}
