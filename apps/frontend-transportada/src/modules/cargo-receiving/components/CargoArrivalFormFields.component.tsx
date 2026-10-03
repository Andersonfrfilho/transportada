/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { DatePicker } from '@/components/ui/date-picker'

import type { CargoArrivalRegistrationController } from '../hooks/useCargoArrivalRegistration.hook'
import { maskTypedTime } from '../shared/cargoArrivalTime.service'
import { CARGO_ARRIVAL_LIMITS } from '../shared/cargoReceiving.constant'
import styles from '../styles/cargoReceiving.module.css'
import registrationStyles from '../styles/cargoRegistration.module.css'
import { ArrivalContractorField } from './ArrivalContractorField.component'
import { CargoTextField } from './CargoTextField.component'

type CargoArrivalFormFieldsProps = Readonly<{ form: CargoArrivalRegistrationController }>

/** Contratante, data e hora da chegada, paletes e referência — os dados que abrem o relógio da separação. */
export function CargoArrivalFormFields({ form }: CargoArrivalFormFieldsProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const { draft, feedback } = form

  return (
    <>
      <h2 className={registrationStyles.fieldsTitle}>{t('register.details')}</h2>
      <div className={styles.fields}>
        <ArrivalContractorField
          contractors={form.contractors}
          issue={feedback.issueFor('contractorId')}
          onChange={(value) => form.setDraftField('contractorId', value)}
          value={draft.contractorId}
        />
        <div className={styles.fieldGroup}>
          <label className={styles.field}>
            {t('register.date')}
            <DatePicker
              ariaLabel={t('register.date')}
              chooseYearLabel={t('register.dateField.chooseYear')}
              clearLabel={t('register.dateField.clear')}
              nextMonthLabel={t('register.dateField.nextMonth')}
              onChange={(value) => form.setDraftField('date', value)}
              openCalendarLabel={t('register.dateField.openCalendar')}
              placeholder={t('register.dateField.placeholder')}
              previousMonthLabel={t('register.dateField.previousMonth')}
              value={draft.date}
            />
          </label>
        </div>
        <CargoTextField
          fieldName="arrivedAt"
          hint={t('register.timeHint')}
          inputMode="numeric"
          issue={feedback.issueFor('arrivedAt')}
          label={t('register.time')}
          onChange={(value) => form.setDraftField('time', maskTypedTime(value))}
          placeholder={t('register.timePlaceholder')}
          value={draft.time}
        />
        <CargoTextField
          fieldName="palletCount"
          inputMode="numeric"
          issue={feedback.issueFor('palletCount')}
          label={t('register.palletCount')}
          onChange={(value) => form.setDraftField('palletCount', value)}
          value={draft.palletCount}
        />
        <CargoTextField
          fieldName="reference"
          hint={t('register.referenceHint', { max: CARGO_ARRIVAL_LIMITS.referenceMaxLength })}
          issue={feedback.issueFor('reference')}
          label={t('register.reference')}
          onChange={(value) => form.setDraftField('reference', value)}
          value={draft.reference}
        />
      </div>
    </>
  )
}
