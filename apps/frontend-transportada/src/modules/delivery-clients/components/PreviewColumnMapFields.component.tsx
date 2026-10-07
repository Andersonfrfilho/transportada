/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import type { ReceivingProfileFormController } from '../hooks/useReceivingProfileForm.hook'
import { PREVIEW_ITEM_FIELDS } from '../shared/receivingProfile.types'
import styles from '../styles/contractorDirectory.module.css'
import { ReceivingFormField } from './ReceivingFormField.component'

type PreviewColumnMapFieldsProps = Readonly<{
  form: ReceivingProfileFormController
  isDisabled: boolean
}>

/** Os 13 campos são fixos; o nome de coluna é dado digitado pela pessoa, nunca preset de contratante. */
export function PreviewColumnMapFields({
  form,
  isDisabled,
}: PreviewColumnMapFieldsProps): JSX.Element {
  const { t } = useTranslation('contractorDirectory')

  return (
    <>
      <p className={styles.hint}>{t('profile.columnMapHint')}</p>
      <div className={styles.groupFields}>
        {PREVIEW_ITEM_FIELDS.map((field) => (
          <ReceivingFormField
            fieldName={`previewColumnMap.${field}`}
            isDisabled={isDisabled}
            issue={form.feedback.issueFor(`previewColumnMap.${field}`)}
            key={field}
            label={t(`columns.${field}`)}
            onChange={(value) => form.setColumn(field, value)}
            value={form.draft.previewColumnMap[field]}
          />
        ))}
      </div>
    </>
  )
}
