/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { Select } from '@/components/ui/select'
import { Tooltip } from '@/components/ui/tooltip'

import type {
  OccurrenceRedeliveryPolicy,
  OccurrenceType,
  OccurrenceTypeFlow,
} from '@/modules/trip/shared/occurrence.constant'
import {
  OCCURRENCE_ITEMS_MODE,
  TRIP_OCCURRENCE_STAGE,
} from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeExceptionsState } from '@/modules/trip/shared/occurrenceExceptionPeople.service'
import styles from '@/modules/trip/styles/trip.module.css'

import { useOccurrenceTypeOptions } from '../hooks/useOccurrenceTypeOptions.hook'
import {
  buildOccurrenceTypeUpdate,
  type OccurrenceTypeSaveInput,
} from '../shared/occurrenceTypeUpdate.service'
import { OccurrenceTypeExceptions } from './OccurrenceTypeExceptions.component'
import { OccurrenceTypeRequirementFields } from './OccurrenceTypeRequirementFields.component'

type OccurrenceTypeRowProps = Readonly<{
  canManage: boolean
  exceptions: OccurrenceTypeExceptionsState
  isSaving: boolean
  onSave: (input: OccurrenceTypeSaveInput) => void
  templateLabel: string
  type: OccurrenceType
}>

export function OccurrenceTypeRow({
  canManage,
  exceptions,
  isSaving,
  onSave,
  templateLabel,
  type,
}: OccurrenceTypeRowProps) {
  const { t } = useTranslation('companySettings')
  const { flowOptions, redeliveryPolicyOptions } = useOccurrenceTypeOptions()
  const isDisabled = !canManage || isSaving
  const isDelivery = type.stage === TRIP_OCCURRENCE_STAGE.delivery

  return (
    <div className={styles.occurrenceForm}>
      <span className={styles.hint}>{templateLabel}</span>
      <Checkbox
        checked={type.notifies}
        disabled={isDisabled}
        label={t('occurrenceTypeCatalog.notifies')}
        onChange={(value) => onSave(buildOccurrenceTypeUpdate(type, { notifies: value }))}
      />
      <Checkbox
        checked={type.active}
        disabled={isDisabled}
        label={t('occurrenceTypeCatalog.active')}
        onChange={(value) => onSave(buildOccurrenceTypeUpdate(type, { active: value }))}
      />
      <OccurrenceTypeRequirementFields
        disabled={isDisabled}
        onEdit={(edit) => onSave(buildOccurrenceTypeUpdate(type, edit))}
        type={type}
      />
      {type.itemsMode === OCCURRENCE_ITEMS_MODE.off ? null : (
        <Checkbox
          checked={type.allowsMultipleItems}
          disabled={isDisabled}
          label={t('occurrenceTypeCatalog.allowsMultipleItems')}
          onChange={(value) =>
            onSave(buildOccurrenceTypeUpdate(type, { allowsMultipleItems: value }))
          }
        />
      )}
      {type.itemsMode === OCCURRENCE_ITEMS_MODE.off ? null : (
        <Select
          ariaLabel={t('occurrenceTypeCatalog.redeliveryPolicy')}
          disabled={isDisabled}
          onChange={(value) =>
            onSave(
              buildOccurrenceTypeUpdate(type, {
                redeliveryPolicy: value as OccurrenceRedeliveryPolicy,
              }),
            )
          }
          options={redeliveryPolicyOptions}
          value={type.redeliveryPolicy}
        />
      )}
      {/* Spec 179 T401: só em tipo de rua — é o motorista quem tira a foto na hora. */}
      {isDelivery ? (
        <Tooltip dismissOnActivate label={t('occurrenceTypeCatalog.flowHint')}>
          <Select
            ariaLabel={t('occurrenceTypeCatalog.flow')}
            disabled={isDisabled}
            onChange={(value) =>
              onSave(buildOccurrenceTypeUpdate(type, { flow: value as OccurrenceTypeFlow }))
            }
            options={flowOptions}
            value={type.flow}
          />
        </Tooltip>
      ) : null}
      {/* Spec 185 T6.1 (D2/RF6): só para tipos de separação — o CHECK do banco recusa em `delivery`. */}
      {type.stage === TRIP_OCCURRENCE_STAGE.separation ? (
        <Tooltip label={t('occurrenceTypeCatalog.leavesDocumentBehindHint')}>
          <Checkbox
            checked={type.leavesDocumentBehind}
            disabled={isDisabled}
            label={t('occurrenceTypeCatalog.leavesDocumentBehind')}
            onChange={(value) =>
              onSave(buildOccurrenceTypeUpdate(type, { leavesDocumentBehind: value }))
            }
          />
        </Tooltip>
      ) : null}
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
