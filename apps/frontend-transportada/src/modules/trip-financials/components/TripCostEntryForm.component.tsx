/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'

import { maskTypedAmount, TYPED_MONEY_SCALE } from '@/modules/shared/decimalAmount.service'

import {
  EMPTY_TRIP_COST_ENTRY_FORM,
  TRIP_COST_ENTRY_DESCRIPTION_MAX_LENGTH,
  validateTripCostEntryForm,
  type TripCostEntryFormFields,
} from '../shared/tripCostEntryForm.service'
import { TRIP_COST_ENTRY_KINDS, isTripCostEntryKind } from '../shared/tripFinancials.types'
import styles from '../styles/tripFinancials.module.css'

type TripCostEntryFormProps = Readonly<{
  isRecording: boolean
  onRecord: (fields: TripCostEntryFormFields) => Promise<boolean>
}>

/**
 * Spec 143 D6: o campo que lança um gasto avulso da viagem.
 *
 * ⚠️ O arquivo é a fronteira da permissão: quem não tem `trip.manage` não monta este componente —
 * campo desabilitado seria promessa de que basta pedir, e aviso de permissão seria ruído.
 */
export function TripCostEntryForm({ isRecording, onRecord }: TripCostEntryFormProps) {
  const { t } = useTranslation('tripFinancials')
  const [fields, setFields] = useState<TripCostEntryFormFields>(EMPTY_TRIP_COST_ENTRY_FORM)
  const issues = validateTripCostEntryForm(fields)

  /** ⚠️ Só o sucesso limpa: apagado depois de um 400, o mesmo custo é redigitado e entra duas vezes. */
  async function handleRecord(): Promise<void> {
    const isRecorded = await onRecord(fields)
    if (isRecorded) setFields(EMPTY_TRIP_COST_ENTRY_FORM)
  }

  return (
    <div className={styles.costEntryForm}>
      <label className={styles.field}>
        {t('costEntries.amount')}
        <input
          inputMode="decimal"
          onChange={(event) =>
            setFields({
              ...fields,
              amount: maskTypedAmount({ scale: TYPED_MONEY_SCALE, value: event.target.value }),
            })
          }
          placeholder={t('costEntries.amountPlaceholder')}
          value={fields.amount}
        />
      </label>
      <label className={styles.field}>
        {t('costEntries.kind')}
        <Select
          onChange={(value) => {
            if (isTripCostEntryKind(value)) setFields({ ...fields, kind: value })
          }}
          options={TRIP_COST_ENTRY_KINDS.map((kind) => ({
            label: t(`costEntries.kinds.${kind}`),
            value: kind,
          }))}
          value={fields.kind}
        />
      </label>
      <label className={cn(styles.field, styles.costEntryDescriptionField)}>
        {t('costEntries.description')}
        <input
          maxLength={TRIP_COST_ENTRY_DESCRIPTION_MAX_LENGTH}
          onChange={(event) => setFields({ ...fields, description: event.target.value })}
          placeholder={t('costEntries.descriptionPlaceholder')}
          value={fields.description}
        />
      </label>
      <Button
        disabled={issues.length > 0 || isRecording}
        onClick={() => void handleRecord()}
        type="button"
        variant="ghost"
      >
        <Icon name="save" />
        {isRecording ? t('costEntries.recording') : t('costEntries.record')}
      </Button>
    </div>
  )
}
