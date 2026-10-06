/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, useRef, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'

import { useContractorDetailsForm } from '../hooks/useContractorDetailsForm.hook'
import {
  CONTRACTOR_CLOSING_PERIODS,
  CONTRACTOR_STATUSES,
  type Contractor,
  type ContractorClosingPeriod,
  type ContractorStatus,
} from '../shared/contractorDirectory.types'
import styles from '../styles/contractorDirectory.module.css'
import { ReceivingFormField } from './ReceivingFormField.component'
import { RefusedFieldsHint } from './RefusedFieldsHint.component'

type ContractorDetailsFormProps = Readonly<{
  contractor: Contractor
  isDisabled: boolean
}>

function isClosingPeriod(value: string): value is ContractorClosingPeriod {
  return CONTRACTOR_CLOSING_PERIODS.some((period) => period === value)
}

function isStatus(value: string): value is ContractorStatus {
  return CONTRACTOR_STATUSES.some((status) => status === value)
}

/** O que o `PATCH /contractors/:id` aceita. O CNPJ não aparece como campo: é a identidade, só leitura. */
export function ContractorDetailsForm({
  contractor,
  isDisabled,
}: ContractorDetailsFormProps): JSX.Element {
  const { t } = useTranslation('contractorDirectory')
  const form = useContractorDetailsForm(contractor)
  const titleId = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const { draft, feedback } = form

  return (
    <form
      aria-labelledby={titleId}
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        form.submit()
      }}
      ref={formRef}
    >
      <h4 id={titleId}>{t('details.title')}</h4>
      <RefusedFieldsHint fields={feedback.summary} panelRef={formRef} />

      <ReceivingFormField
        fieldName="displayName"
        hint={t('details.displayNameHint')}
        isDisabled={isDisabled}
        issue={feedback.issueFor('displayName')}
        label={t('details.displayName')}
        onChange={(value) => form.setField('displayName', value)}
        value={draft.displayName}
      />

      <label className={styles.field}>
        {t('details.closingPeriod')}
        <Select
          ariaLabel={t('details.closingPeriod')}
          disabled={isDisabled}
          onChange={(value) => {
            if (isClosingPeriod(value)) form.setField('closingPeriod', value)
          }}
          options={CONTRACTOR_CLOSING_PERIODS.map((period) => ({
            label: t(`details.closing.${period}`),
            value: period,
          }))}
          value={draft.closingPeriod}
        />
      </label>
      <p className={styles.hint}>{t('details.closingPeriodHint')}</p>

      <ReceivingFormField
        fieldName="reportEmail"
        hint={t('details.reportEmailHint')}
        inputMode="text"
        isDisabled={isDisabled}
        issue={feedback.issueFor('reportEmail')}
        label={t('details.reportEmail')}
        onChange={(value) => form.setField('reportEmail', value)}
        value={draft.reportEmail}
      />

      <ReceivingFormField
        fieldName="notes"
        isDisabled={isDisabled}
        isMultiline
        issue={feedback.issueFor('notes')}
        label={t('details.notes')}
        onChange={(value) => form.setField('notes', value)}
        value={draft.notes}
      />

      <label className={styles.field}>
        {t('details.status')}
        <Select
          ariaLabel={t('details.status')}
          disabled={isDisabled}
          onChange={(value) => {
            if (isStatus(value)) form.setField('status', value)
          }}
          options={CONTRACTOR_STATUSES.map((status) => ({
            label: t(`status.${status}`),
            value: status,
          }))}
          value={draft.status}
        />
      </label>

      {isDisabled ? null : (
        <div className={styles.actions}>
          <Button disabled={form.isSaving} type="submit">
            <Icon name="save" />
            {form.isSaving ? t('details.saving') : t('details.save')}
          </Button>
          {form.isSaved ? <p className={styles.saved}>{t('details.saved')}</p> : null}
          {form.errorCode === undefined ? null : (
            <p className={styles.error} role="alert">
              {t('details.error', { code: form.errorCode })}
            </p>
          )}
        </div>
      )}
    </form>
  )
}
