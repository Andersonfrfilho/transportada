/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { HolidayFeedbackController } from '../hooks/useHolidayFeedback.hook'
import type { MunicipalHolidayFormController } from '../hooks/useMunicipalHolidayForm.hook'
import { HOLIDAY_KINDS } from '../shared/businessCalendar.constant'
import styles from '../styles/businessCalendar.module.css'

import { HolidayChoiceField } from './HolidayChoiceField.component'
import { HolidayFormActions } from './HolidayFormActions.component'
import { HolidayNotices } from './HolidayNotices.component'
import { HolidayRefusal } from './HolidayRefusal.component'
import { HolidayTextField } from './HolidayTextField.component'
import { HolidayWhenFields } from './HolidayWhenFields.component'
import { MunicipalPlaceFields } from './MunicipalPlaceFields.component'

type MunicipalHolidayFormProps = Readonly<{
  controller: MunicipalHolidayFormController
  feedback: HolidayFeedbackController
  onShortcut: (field: string) => void
}>

/** Cadastro e edição do feriado do município. Na edição, a cidade e a recorrência ficam travadas. */
export function MunicipalHolidayForm({
  controller,
  feedback,
  onShortcut,
}: MunicipalHolidayFormProps) {
  const { t } = useTranslation('businessCalendar')
  const { draft, issues } = controller.form
  const isEditing = controller.editing !== undefined
  const isTypedDate = controller.editing?.origin === 'date'

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void controller.handleSubmit()
      }}
    >
      {controller.editing === undefined ? null : (
        <>
          <p className={styles.hint}>
            {t('municipal.form.editing', { name: controller.editing.name })}
          </p>
          <p className={styles.hint}>
            {t(isTypedDate ? 'municipal.form.lockedHintDate' : 'municipal.form.lockedHint')}
          </p>
        </>
      )}
      <div className={styles.fieldGrid}>
        <MunicipalPlaceFields
          cityOptions={controller.city.options}
          cityStatus={controller.city.status}
          controller={controller.form}
          isLocked={isEditing}
        />
        <HolidayChoiceField
          ariaLabel={t('form.kindAria')}
          field="kind"
          issue={issues.kind}
          label={t('fields.kind')}
          onChange={controller.form.setKind}
          options={HOLIDAY_KINDS.map((value) => ({ label: t(`kinds.${value}`), value }))}
          placeholder={t('form.kindPlaceholder')}
          value={draft.kind}
        />
        <HolidayWhenFields
          controller={controller.form}
          isDateFixed={isTypedDate}
          isRecurrenceLocked={isEditing}
        />
        <HolidayTextField
          field="name"
          isWide
          issue={issues.name}
          label={t('form.nameAria')}
          onChange={(value) => controller.form.setText('name', value)}
          placeholder={t('form.namePlaceholder')}
          value={draft.name}
        />
      </div>
      {feedback.refusal === undefined ? null : (
        <HolidayRefusal onShortcut={onShortcut} refusal={feedback.refusal} />
      )}
      <HolidayNotices notices={feedback.notices} />
      <HolidayFormActions
        createLabel={t('municipal.form.submitCreate')}
        isEditing={isEditing}
        isSaving={controller.isSaving}
        isUnchanged={controller.isUnchanged}
        onCancelEdit={controller.handleCancelEdit}
      />
    </form>
  )
}
