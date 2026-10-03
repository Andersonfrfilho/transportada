/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'

import type { ReceivingProfileFormController } from '../hooks/useReceivingProfileForm.hook'
import styles from '../styles/contractorDirectory.module.css'
import { PreviewColumnMapFields } from './PreviewColumnMapFields.component'
import { ReceivingFormField } from './ReceivingFormField.component'

type ReceivingProfileGroupsProps = Readonly<{
  form: ReceivingProfileFormController
  isDisabled: boolean
}>

function hasMappedColumn(form: ReceivingProfileFormController): boolean {
  return Object.values(form.draft.previewColumnMap).some((columnName) => columnName.trim() !== '')
}

/** Os quatro grupos da ficha: Recebimento, Prazos, Prévia da planilha e Avançado. */
export function ReceivingProfileGroups({
  form,
  isDisabled,
}: ReceivingProfileGroupsProps): JSX.Element {
  const { t } = useTranslation('contractorDirectory')
  const { draft, feedback } = form
  const shouldShowColumns = draft.previewEnabled || hasMappedColumn(form)

  return (
    <>
      <fieldset className={styles.group}>
        <legend>{t('profile.groups.receiving')}</legend>
        <Checkbox
          checked={draft.isEnabled}
          disabled={isDisabled}
          label={t('fields.isEnabled')}
          onChange={(checked) => form.setField('isEnabled', checked)}
        />
        <p className={styles.hint}>{t('profile.isEnabledHint')}</p>
        <Checkbox
          checked={draft.requiresDamageCheck}
          disabled={isDisabled}
          label={t('fields.requiresDamageCheck')}
          onChange={(checked) => form.setField('requiresDamageCheck', checked)}
        />
        <p className={styles.hint}>{t('profile.requiresDamageCheckHint')}</p>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>{t('profile.groups.deadlines')}</legend>
        <div className={styles.groupFields}>
          <ReceivingFormField
            fieldName="separationWindowHours"
            hint={t('profile.separationWindowHoursHint')}
            inputMode="numeric"
            isDisabled={isDisabled}
            issue={feedback.issueFor('separationWindowHours')}
            label={t('fields.separationWindowHours')}
            onChange={(value) => form.setField('separationWindowHours', value)}
            value={draft.separationWindowHours}
          />
          <ReceivingFormField
            fieldName="deliveryDeadlineBusinessDays"
            hint={t('profile.deliveryDeadlineBusinessDaysHint')}
            inputMode="numeric"
            isDisabled={isDisabled}
            issue={feedback.issueFor('deliveryDeadlineBusinessDays')}
            label={t('fields.deliveryDeadlineBusinessDays')}
            onChange={(value) => form.setField('deliveryDeadlineBusinessDays', value)}
            value={draft.deliveryDeadlineBusinessDays}
          />
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>{t('profile.groups.preview')}</legend>
        <Checkbox
          checked={draft.previewEnabled}
          disabled={isDisabled}
          label={t('fields.previewEnabled')}
          onChange={(checked) => form.setField('previewEnabled', checked)}
        />
        <p className={styles.hint}>{t('profile.previewEnabledHint')}</p>
        {shouldShowColumns ? (
          <>
            <ReceivingFormField
              fieldName="previewSheetName"
              hint={t('profile.previewSheetNameHint')}
              isDisabled={isDisabled}
              issue={feedback.issueFor('previewSheetName')}
              label={t('fields.previewSheetName')}
              onChange={(value) => form.setField('previewSheetName', value)}
              value={draft.previewSheetName}
            />
            <PreviewColumnMapFields form={form} isDisabled={isDisabled} />
          </>
        ) : null}
      </fieldset>

      <fieldset className={styles.group}>
        <legend>{t('profile.groups.advanced')}</legend>
        <div className={styles.groupFields}>
          <ReceivingFormField
            fieldName="matchWindowDays"
            hint={t('profile.matchWindowDaysHint')}
            inputMode="numeric"
            isDisabled={isDisabled}
            issue={feedback.issueFor('matchWindowDays')}
            label={t('fields.matchWindowDays')}
            onChange={(value) => form.setField('matchWindowDays', value)}
            value={draft.matchWindowDays}
          />
          <ReceivingFormField
            fieldName="weightTolerancePercent"
            hint={t('profile.weightTolerancePercentHint')}
            inputMode="decimal"
            isDisabled={isDisabled}
            issue={feedback.issueFor('weightTolerancePercent')}
            label={t('fields.weightTolerancePercent')}
            onChange={(value) => form.setField('weightTolerancePercent', value)}
            value={draft.weightTolerancePercent}
          />
        </div>
        <ReceivingFormField
          fieldName="arrivalReferencePattern"
          hint={t('profile.arrivalReferencePatternHint')}
          isDisabled={isDisabled}
          issue={feedback.issueFor('arrivalReferencePattern')}
          label={t('fields.arrivalReferencePattern')}
          onChange={(value) => form.setField('arrivalReferencePattern', value)}
          value={draft.arrivalReferencePattern}
        />
      </fieldset>
    </>
  )
}
