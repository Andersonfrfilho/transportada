/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'

import { maskTypedAmount, TYPED_MONEY_SCALE } from '@/modules/shared/decimalAmount.service'

import {
  EMPTY_TRIP_REVENUE_ENTRY_FORM,
  TRIP_REVENUE_ENTRY_DESCRIPTION_MAX_LENGTH,
  validateTripRevenueEntryForm,
  type TripRevenueEntryFormFields,
} from '../shared/tripRevenueEntryForm.service'
import type { CompanyEntryKind } from '../shared/tripFinancials.types'
import styles from '../styles/tripFinancials.module.css'

type TripRevenueEntryFormProps = Readonly<{
  entryKinds: readonly CompanyEntryKind[]
  isRecording: boolean
  onRecord: (fields: TripRevenueEntryFormFields) => Promise<boolean>
}>

/**
 * Spec 169 P1: o campo que lança a receita entrada fora do frete — ajuda de carga, taxa de
 * reentrega, diária cobrada do embarcador. Espelha `TripCostEntryForm.component.tsx`.
 *
 * ⚠️ O arquivo é a fronteira da permissão: quem não tem `trip.manage` não monta este componente.
 */
export function TripRevenueEntryForm({
  entryKinds,
  isRecording,
  onRecord,
}: TripRevenueEntryFormProps) {
  const { t } = useTranslation('tripFinancials')
  const [fields, setFields] = useState<TripRevenueEntryFormFields>(EMPTY_TRIP_REVENUE_ENTRY_FORM)
  const issues = validateTripRevenueEntryForm(fields)

  /** ⚠️ Só o sucesso limpa: apagado depois de um 400, a mesma receita é redigitada e entra duas vezes. */
  async function handleRecord(): Promise<void> {
    const isRecorded = await onRecord(fields)
    if (isRecorded) setFields(EMPTY_TRIP_REVENUE_ENTRY_FORM)
  }

  return (
    <div className={styles.costEntryForm}>
      <label className={styles.field}>
        {t('revenueEntries.amount')}
        <input
          inputMode="decimal"
          onChange={(event) =>
            setFields({
              ...fields,
              amount: maskTypedAmount({ scale: TYPED_MONEY_SCALE, value: event.target.value }),
            })
          }
          placeholder={t('revenueEntries.amountPlaceholder')}
          value={fields.amount}
        />
      </label>
      <label className={styles.field}>
        {t('revenueEntries.kind')}
        <Select
          onChange={(value) => setFields({ ...fields, entryKindId: value })}
          options={entryKinds.map((kind) => ({ label: kind.name, value: kind.id }))}
          value={fields.entryKindId}
        />
      </label>
      <label className={cn(styles.field, styles.costEntryDescriptionField)}>
        {t('revenueEntries.description')}
        <input
          maxLength={TRIP_REVENUE_ENTRY_DESCRIPTION_MAX_LENGTH}
          onChange={(event) => setFields({ ...fields, description: event.target.value })}
          placeholder={t('revenueEntries.descriptionPlaceholder')}
          value={fields.description}
        />
      </label>
      <Button
        disabled={issues.length > 0 || isRecording || entryKinds.length === 0}
        onClick={() => void handleRecord()}
        type="button"
        variant="ghost"
      >
        <Icon name="save" />
        {isRecording ? t('revenueEntries.recording') : t('revenueEntries.record')}
      </Button>
    </div>
  )
}
