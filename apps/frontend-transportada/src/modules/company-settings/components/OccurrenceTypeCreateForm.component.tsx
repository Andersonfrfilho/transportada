/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select } from '@/components/ui/select'
import { Tooltip } from '@/components/ui/tooltip'

import {
  OCCURRENCE_REDELIVERY_POLICY,
  OCCURRENCE_TYPE_FLOWS,
  TRIP_OCCURRENCE_STAGE,
} from '@/modules/trip/shared/occurrence.constant'
import type {
  OccurrenceAttachmentMode,
  OccurrenceItemsWriteMode,
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
  const [name, setName] = useState('')
  const [stage, setStage] = useState<TripOccurrenceStage>(TRIP_OCCURRENCE_STAGE.separation)
  const [notifies, setNotifies] = useState(false)
  const [emailTemplateKey, setEmailTemplateKey] = useState<string>(OCCURRENCE_TEMPLATE_NONE)
  /** RF3: o padrão é aceitar vários itens — preserva o comportamento de hoje. */
  const [allowsMultipleItems, setAllowsMultipleItems] = useState(true)
  /** Spec 164 D1: nasce `unset` — nenhum tipo novo escala para o contratante sem decisão explícita. */
  const [redeliveryPolicy, setRedeliveryPolicy] = useState<OccurrenceRedeliveryPolicy>(
    OCCURRENCE_REDELIVERY_POLICY.unset,
  )
  /** Spec 185 D2/RF6: padrão desligado — nenhum tipo novo tira nota da viagem sem decisão explícita. */
  const [leavesDocumentBehind, setLeavesDocumentBehind] = useState(false)
  /** Spec 179 RF1: nasce `off` — nenhum tipo novo passa a exigir foto sem decisão explícita. */
  const [attachmentMode, setAttachmentMode] = useState<OccurrenceAttachmentMode>('off')
  /** Spec 218 (D1, RF-B5): obrigatório na criação — nasce `document`, o comportamento de sempre. */
  const [flow, setFlow] = useState<OccurrenceTypeFlow>(OCCURRENCE_TYPE_FLOWS[0])
  /** Spec 241 RF10: nasce `optional`, o comportamento de hoje — Desligado é decisão explícita. */
  const [itemsMode, setItemsMode] = useState<OccurrenceItemsWriteMode>('optional')
  const isItemsOff = hasItemsModeSupport && itemsMode === 'off'

  function handleAdd() {
    if (name.trim() === '') return
    const itemsModeField = hasItemsModeSupport ? { itemsMode } : {}
    onSave({
      active: true,
      allowsMultipleItems,
      attachmentMode: stage === TRIP_OCCURRENCE_STAGE.delivery ? attachmentMode : 'off',
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
    setName('')
    setNotifies(false)
    setEmailTemplateKey(OCCURRENCE_TEMPLATE_NONE)
    setAllowsMultipleItems(true)
    setRedeliveryPolicy(OCCURRENCE_REDELIVERY_POLICY.unset)
    setLeavesDocumentBehind(false)
    setAttachmentMode('off')
    setFlow(OCCURRENCE_TYPE_FLOWS[0])
    setItemsMode('optional')
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
        onChange={(event) => setName(event.target.value)}
        placeholder={t('occurrenceTypeCatalog.name')}
        type="text"
        value={name}
      />
      <Select
        ariaLabel={t('occurrenceTypeCatalog.stage')}
        onChange={(value) => setStage(value as TripOccurrenceStage)}
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
        onChange={setNotifies}
      />
      {hasItemsModeSupport ? (
        <OccurrenceTypeItemsModeSelect onChange={setItemsMode} value={itemsMode} />
      ) : null}
      {isItemsOff ? null : (
        <Checkbox
          checked={allowsMultipleItems}
          label={t('occurrenceTypeCatalog.allowsMultipleItems')}
          onChange={setAllowsMultipleItems}
        />
      )}
      {isItemsOff ? null : (
        <Select
          ariaLabel={t('occurrenceTypeCatalog.redeliveryPolicy')}
          onChange={(value) => setRedeliveryPolicy(value as OccurrenceRedeliveryPolicy)}
          options={redeliveryPolicyOptions}
          value={redeliveryPolicy}
        />
      )}
      {stage === TRIP_OCCURRENCE_STAGE.delivery ? (
        <Tooltip dismissOnActivate label={t('occurrenceTypeCatalog.attachmentModeHint')}>
          <Select
            ariaLabel={t('occurrenceTypeCatalog.attachmentMode')}
            onChange={(value) => setAttachmentMode(value as OccurrenceAttachmentMode)}
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
            onChange={(value) => setFlow(value as OccurrenceTypeFlow)}
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
            onChange={setLeavesDocumentBehind}
          />
        </Tooltip>
      ) : null}
      <Select
        ariaLabel={t('occurrenceTypeCatalog.emailTemplate')}
        onChange={setEmailTemplateKey}
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
