/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { HolidayFeedbackController } from '../hooks/useHolidayFeedback.hook'
import type { StateHolidayFormController } from '../hooks/useStateHolidayForm.hook'
import { STATE_CHOICES } from '../shared/businessCalendar.constant'
import styles from '../styles/businessCalendar.module.css'

import { HolidayChoiceField } from './HolidayChoiceField.component'
import { HolidayFormActions } from './HolidayFormActions.component'
import { HolidayNotices } from './HolidayNotices.component'
import { HolidayRefusal } from './HolidayRefusal.component'
import { HolidayTextField } from './HolidayTextField.component'
import { HolidayWhenFields } from './HolidayWhenFields.component'

type StateHolidayFormProps = Readonly<{
  controller: StateHolidayFormController
  feedback: HolidayFeedbackController
  onShortcut: (field: string) => void
}>

/** Cadastro e edição do feriado estadual. A UF e a recorrência são a identidade da linha: a edição as trava. */
export function StateHolidayForm({ controller, feedback, onShortcut }: StateHolidayFormProps) {
  const { t } = useTranslation('businessCalendar')
  const { draft, issues } = controller.form
  const isEditing = controller.editing !== undefined

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
            {t('state.form.editing', { name: controller.editing.name })}
          </p>
          <p className={styles.hint}>{t('state.form.lockedHint')}</p>
        </>
      )}
      <div className={styles.fieldGrid}>
        <HolidayChoiceField
          ariaLabel={t('state.form.stateAria')}
          disabled={isEditing}
          field="stateIbgeCode"
          issue={issues.stateIbgeCode}
          label={t('fields.stateIbgeCode')}
          onChange={(value) => controller.form.setText('stateIbgeCode', value)}
          options={STATE_CHOICES}
          placeholder={t('municipal.form.statePlaceholder')}
          value={draft.stateIbgeCode}
        />
        <HolidayWhenFields
          controller={controller.form}
          isDateFixed={false}
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
        createLabel={t('state.form.submitCreate')}
        isEditing={isEditing}
        isSaving={controller.isSaving}
        isUnchanged={controller.isUnchanged}
        onCancelEdit={controller.handleCancelEdit}
      />
    </form>
  )
}
