/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { NOTIFICATION_SETTINGS_HREF } from '@/modules/notification/shared/notificationCatalog.constant'
import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'
import type { OccurrenceRedeliveryPolicy } from '@/modules/trip/shared/occurrence.constant'
import { TRIP_OCCURRENCE_STAGE } from '@/modules/trip/shared/occurrence.constant'
import { readOccurrenceMomentsProblem } from '@/modules/trip/shared/occurrenceMoments.service'
import { readRequirementFieldsOfMoments } from '@/modules/trip/shared/occurrenceRequirementScope.service'
import {
  OCCURRENCE_TEMPLATE_NONE,
  type buildOccurrenceEmailTemplateOptions,
} from '@/modules/trip/shared/occurrenceTemplate.service'
import {
  buildOccurrenceTypeCreateInput,
  deriveOccurrenceStage,
  type OccurrenceTypeCreateSupport,
} from '@/modules/trip/shared/occurrenceTypeCreate.service'
import createStyles from '@/modules/trip/styles/occurrenceTypeCreate.module.css'
import itemStyles from '@/modules/trip/styles/occurrenceTypeItem.module.css'
import styles from '@/modules/trip/styles/trip.module.css'

import { useOccurrenceTypeCreateDraft } from '../hooks/useOccurrenceTypeCreateDraft.hook'
import { useOccurrenceTypeOptions } from '../hooks/useOccurrenceTypeOptions.hook'
import type { OccurrenceTypeSaveInput } from '../shared/occurrenceTypeUpdate.service'
import { OccurrenceRequirementModeSelect } from './OccurrenceRequirementModeSelect.component'
import { OccurrenceTypeCreateMoments } from './OccurrenceTypeCreateMoments.component'
import { OccurrenceTypeHiddenFieldsHint } from './OccurrenceTypeHiddenFieldsHint.component'

type OccurrenceTypeCreateFormProps = Readonly<{
  isSaving: boolean
  onSave: (input: OccurrenceTypeSaveInput) => void
  /** O que a API que respondeu a listagem aceita: não se oferece o que ela recusaria. */
  support: OccurrenceTypeCreateSupport
  templateOptions: ReturnType<typeof buildOccurrenceEmailTemplateOptions>
}>

/**
 * Spec 246 RF1a/M4: o cadastro do tipo novo fala o mesmo vocabulário do tipo aberto — momentos e as
 * quatro exigências em Desligado · Opcional · Obrigatório. O grupo e o fluxo saem dos momentos.
 */
export function OccurrenceTypeCreateForm({
  isSaving,
  onSave,
  support,
  templateOptions,
}: OccurrenceTypeCreateFormProps) {
  const { t } = useTranslation('companySettings')
  const { redeliveryPolicyOptions } = useOccurrenceTypeOptions()
  const draft = useOccurrenceTypeCreateDraft(support.hasItemsMode)
  const momentsProblem = support.hasMoments ? readOccurrenceMomentsProblem(draft.moments) : null
  const fields = readRequirementFieldsOfMoments(draft.moments).filter(
    (field) =>
      (field !== 'items' || support.hasItemsMode) &&
      ((field !== 'note' && field !== 'signature') || support.hasRequirementModes),
  )
  const isSeparation = deriveOccurrenceStage(draft.moments) === TRIP_OCCURRENCE_STAGE.separation
  const modes = {
    items: [draft.itemsMode, draft.setItemsMode],
    note: [draft.noteMode, draft.setNoteMode],
    photo: [draft.attachmentMode, draft.setAttachmentMode],
    signature: [draft.signatureMode, draft.setSignatureMode],
  } as const

  function handleAdd() {
    if (draft.name.trim() === '' || momentsProblem !== null) return
    onSave(buildOccurrenceTypeCreateInput({ draft, support }))
    draft.reset()
  }

  function handleEditTemplates() {
    const navigator = createBrowserWorkspaceNavigator()
    navigator.pushPath(NOTIFICATION_SETTINGS_HREF)
    navigator.rememberWorkspace('notification')
    navigator.dispatchPopState()
  }

  return (
    <section aria-label={t('occurrenceTypeCatalog.create.title')} className={createStyles.create}>
      <p className={itemStyles.blockTitle}>{t('occurrenceTypeCatalog.create.title')}</p>
      <div className={styles.occurrenceForm}>
        <input
          aria-label={t('occurrenceTypeCatalog.name')}
          onChange={(event) => draft.setName(event.target.value)}
          placeholder={t('occurrenceTypeCatalog.name')}
          type="text"
          value={draft.name}
        />
        {support.hasMoments ? (
          <OccurrenceTypeCreateMoments
            moments={draft.moments}
            onChange={draft.setMoments}
            problem={momentsProblem}
          />
        ) : null}
        <div className={createStyles.createFields}>
          {fields.map((field) => (
            <OccurrenceRequirementModeSelect
              disabled={false}
              field={field}
              key={field}
              onChange={(mode) => modes[field][1](mode)}
              value={modes[field][0]}
            />
          ))}
        </div>
        <Checkbox
          checked={draft.notifies}
          label={t('occurrenceTypeCatalog.notifies')}
          onChange={draft.setNotifies}
        />
        {draft.isItemsOff ? null : (
          <Checkbox
            checked={draft.allowsMultipleItems}
            label={t('occurrenceTypeCatalog.allowsMultipleItems')}
            onChange={draft.setAllowsMultipleItems}
          />
        )}
        {draft.isItemsOff ? null : (
          <Select
            ariaLabel={t('occurrenceTypeCatalog.redeliveryPolicy')}
            onChange={(value) => draft.setRedeliveryPolicy(value as OccurrenceRedeliveryPolicy)}
            options={redeliveryPolicyOptions}
            value={draft.redeliveryPolicy}
          />
        )}
        {isSeparation ? (
          <Checkbox
            checked={draft.leavesDocumentBehind}
            label={t('occurrenceTypeCatalog.leavesDocumentBehind')}
            onChange={draft.setLeavesDocumentBehind}
          />
        ) : null}
        <OccurrenceTypeHiddenFieldsHint
          isItemsOff={draft.isItemsOff}
          isSeparationOnlyHidden={support.hasMoments && draft.moments.length > 0 && !isSeparation}
        />
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
          value={draft.emailTemplateKey}
        />
        <div className={createStyles.createActions}>
          <Button
            disabled={isSaving || momentsProblem !== null}
            onClick={handleAdd}
            size="sm"
            type="button"
          >
            <Icon name="add" />
            {t('occurrenceTypeCatalog.add')}
          </Button>
          <Button onClick={handleEditTemplates} size="sm" type="button" variant="ghost">
            <Icon name="edit" />
            {t('occurrenceTypeCatalog.editTemplates')}
          </Button>
        </div>
      </div>
    </section>
  )
}
