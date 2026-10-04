/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select } from '@/components/ui/select'
import { Tooltip } from '@/components/ui/tooltip'

import {
  OCCURRENCE_ATTACHMENT_MODE,
  OCCURRENCE_REDELIVERY_POLICY,
  TRIP_OCCURRENCE_STAGE,
} from '@/modules/trip/shared/occurrence.constant'
import type {
  OccurrenceAttachmentMode,
  OccurrenceRedeliveryPolicy,
  OccurrenceTypeFlow,
  TripOccurrenceStage,
} from '@/modules/trip/shared/occurrence.constant'
import {
  OCCURRENCE_TEMPLATE_NONE,
  type buildOccurrenceEmailTemplateOptions,
} from '@/modules/trip/shared/occurrenceTemplate.service'
import { NOTIFICATION_SETTINGS_HREF } from '@/modules/notification/shared/notificationCatalog.constant'
import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'
import styles from '@/modules/trip/styles/trip.module.css'

import { useOccurrenceTypeCreateDraft } from '../hooks/useOccurrenceTypeCreateDraft.hook'
import { useOccurrenceTypeOptions } from '../hooks/useOccurrenceTypeOptions.hook'
import type { OccurrenceTypeSaveInput } from '../shared/occurrenceTypeUpdate.service'
import { OccurrenceTypeItemsModeSelect } from './OccurrenceTypeItemsModeSelect.component'

type OccurrenceTypeCreateFormProps = Readonly<{
  /** Sem `itemsMode` em nenhum tipo da listagem a API é anterior ao campo: não se oferece o que ela ignoraria. */
  hasItemsModeSupport: boolean
  isSaving: boolean
  onSave: (input: OccurrenceTypeSaveInput) => void
  templateOptions: ReturnType<typeof buildOccurrenceEmailTemplateOptions>
}>

export function OccurrenceTypeCreateForm({
  hasItemsModeSupport,
  isSaving,
  onSave,
  templateOptions,
}: OccurrenceTypeCreateFormProps) {
  const { t } = useTranslation('companySettings')
  const { attachmentModeOptions, flowOptions, redeliveryPolicyOptions } = useOccurrenceTypeOptions()
  const draft = useOccurrenceTypeCreateDraft(hasItemsModeSupport)
  const {
    allowsMultipleItems,
    attachmentMode,
    emailTemplateKey,
    flow,
    isItemsOff,
    itemsMode,
    leavesDocumentBehind,
    name,
    notifies,
    redeliveryPolicy,
    stage,
  } = draft

  function handleAdd() {
    if (name.trim() === '') return
    const itemsModeField = hasItemsModeSupport ? { itemsMode } : {}
    onSave({
      active: true,
      allowsMultipleItems,
      attachmentMode:
        stage === TRIP_OCCURRENCE_STAGE.delivery ? attachmentMode : OCCURRENCE_ATTACHMENT_MODE.off,
      emailTemplateKey: emailTemplateKey === OCCURRENCE_TEMPLATE_NONE ? null : emailTemplateKey,
      /** Spec 218 RF-B5: obrigatório na criação — o servidor recusa `occurrenceTypeId: null` sem ele. */
      flow,
      ...itemsModeField,
      leavesDocumentBehind: stage === TRIP_OCCURRENCE_STAGE.separation && leavesDocumentBehind,
      name,
      notifies,
      occurrenceTypeId: null,
      redeliveryPolicy: isItemsOff ? OCCURRENCE_REDELIVERY_POLICY.unset : redeliveryPolicy,
      stage,
    })
    draft.reset()
  }

  function handleEditTemplates() {
    const navigator = createBrowserWorkspaceNavigator()
    navigator.pushPath(NOTIFICATION_SETTINGS_HREF)
    navigator.rememberWorkspace('notification')
    navigator.dispatchPopState()
  }

  return (
    <div className={styles.occurrenceForm}>
      <input
        aria-label={t('occurrenceTypeCatalog.name')}
        onChange={(event) => draft.setName(event.target.value)}
        placeholder={t('occurrenceTypeCatalog.name')}
        type="text"
        value={name}
      />
      <Select
        ariaLabel={t('occurrenceTypeCatalog.stage')}
        onChange={(value) => draft.setStage(value as TripOccurrenceStage)}
        options={[
          {
            label: t('occurrenceTypeCatalog.stageSeparation'),
            value: TRIP_OCCURRENCE_STAGE.separation,
          },
          {
            label: t('occurrenceTypeCatalog.stageDelivery'),
            value: TRIP_OCCURRENCE_STAGE.delivery,
          },
        ]}
        value={stage}
      />
      <Checkbox
        checked={notifies}
        label={t('occurrenceTypeCatalog.notifies')}
        onChange={draft.setNotifies}
      />
      {hasItemsModeSupport ? (
        <OccurrenceTypeItemsModeSelect onChange={draft.setItemsMode} value={itemsMode} />
      ) : null}
      {isItemsOff ? null : (
        <Checkbox
          checked={allowsMultipleItems}
          label={t('occurrenceTypeCatalog.allowsMultipleItems')}
          onChange={draft.setAllowsMultipleItems}
        />
      )}
      {isItemsOff ? null : (
        <Select
          ariaLabel={t('occurrenceTypeCatalog.redeliveryPolicy')}
          onChange={(value) => draft.setRedeliveryPolicy(value as OccurrenceRedeliveryPolicy)}
          options={redeliveryPolicyOptions}
          value={redeliveryPolicy}
        />
      )}
      {stage === TRIP_OCCURRENCE_STAGE.delivery ? (
        <Tooltip dismissOnActivate label={t('occurrenceTypeCatalog.attachmentModeHint')}>
          <Select
            ariaLabel={t('occurrenceTypeCatalog.attachmentMode')}
            onChange={(value) => draft.setAttachmentMode(value as OccurrenceAttachmentMode)}
            options={attachmentModeOptions}
            value={attachmentMode}
          />
        </Tooltip>
      ) : null}
      {/* Spec 218 (D1, RF-B5): mesmo gate do `attachmentMode` — só tipo de rua tem fluxo de registro. */}
      {stage === TRIP_OCCURRENCE_STAGE.delivery ? (
        <Tooltip dismissOnActivate label={t('occurrenceTypeCatalog.flowHint')}>
          <Select
            ariaLabel={t('occurrenceTypeCatalog.flow')}
            onChange={(value) => draft.setFlow(value as OccurrenceTypeFlow)}
            options={flowOptions}
            value={flow}
          />
        </Tooltip>
      ) : null}
      {/* Spec 185 T6.1 (D2/RF6): só para tipos de separação — o CHECK do banco recusa em `delivery`. */}
      {stage === TRIP_OCCURRENCE_STAGE.separation ? (
        <Tooltip label={t('occurrenceTypeCatalog.leavesDocumentBehindHint')}>
          <Checkbox
            checked={leavesDocumentBehind}
            label={t('occurrenceTypeCatalog.leavesDocumentBehind')}
            onChange={draft.setLeavesDocumentBehind}
          />
        </Tooltip>
      ) : null}
      <Select
        ariaLabel={t('occurrenceTypeCatalog.emailTemplate')}
        onChange={draft.setEmailTemplateKey}
        options={[
          {
            label: t('occurrenceTypeCatalog.emailTemplateNone'),
            value: OCCURRENCE_TEMPLATE_NONE,
          },
          ...templateOptions.map((option) => ({ label: option.label, value: option.key })),
        ]}
        value={emailTemplateKey}
      />
      <Button disabled={isSaving} onClick={handleAdd} size="sm" type="button">
        <Icon name="add" />
        {t('occurrenceTypeCatalog.add')}
      </Button>
      <Button onClick={handleEditTemplates} size="sm" type="button" variant="ghost">
        <Icon name="edit" />
        {t('occurrenceTypeCatalog.editTemplates')}
      </Button>
    </div>
  )
}
