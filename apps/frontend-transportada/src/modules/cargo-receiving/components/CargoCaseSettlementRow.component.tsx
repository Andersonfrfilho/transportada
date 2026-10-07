/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select, type SelectOption } from '@/components/ui/select'
import { AmountLimitNotice } from '@/modules/trip/components/AmountLimitNotice.component'
import { maskAmountInput } from '@/modules/trip/shared/occurrenceSettlementMoney.service'

import { CARGO_SETTLEMENT_PAYER_KINDS } from '../shared/cargoOccurrenceCase.constant'
import type { CargoSettlementPayerKind } from '../shared/cargoOccurrenceCase.types'
import type { SettlementDraftRow, SettlementRowIssue } from '../shared/cargoSettlement.service'
import receivingStyles from '../styles/cargoReceiving.module.css'
import styles from '../styles/cargoOccurrenceCase.module.css'

type RowPatch = Partial<Omit<SettlementDraftRow, 'id'>>

type CargoCaseSettlementRowProps = Readonly<{
  canRemove: boolean
  isDisabled: boolean
  issues: readonly SettlementRowIssue[]
  onChange: (patch: RowPatch) => void
  onRemove: () => void
  position: number
  productOptions: readonly SelectOption[]
  row: SettlementDraftRow
}>

type FieldProps = Readonly<{
  isDisabled: boolean
  onChange: (patch: RowPatch) => void
  row: SettlementDraftRow
}>

function ItemField(
  props: FieldProps &
    Readonly<{ issue: SettlementRowIssue | undefined; options: readonly SelectOption[] }>,
): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  return (
    <div className={receivingStyles.fieldGroup}>
      <span className={styles.settlementLabel}>{t('occurrence.settlement.itemField')}</span>
      <Select
        ariaLabel={t('occurrence.settlement.itemAria')}
        disabled={props.isDisabled}
        onChange={(productCode) => props.onChange({ productCode })}
        options={props.options}
        placeholder={t('occurrence.settlement.itemPlaceholder')}
        value={props.row.productCode}
      />
      {props.issue === undefined ? null : (
        <p className={styles.settlementIssue} role="alert">
          {t(`occurrence.settlement.issues.${props.issue}`)}
        </p>
      )}
    </div>
  )
}

function AmountField(props: FieldProps & Readonly<{ hasIssue: boolean }>): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  return (
    <div className={receivingStyles.fieldGroup}>
      <label className={receivingStyles.field}>
        {t('occurrence.settlement.amountField')}
        <input
          aria-invalid={props.hasIssue ? true : undefined}
          data-settlement-field="amount"
          disabled={props.isDisabled}
          inputMode="decimal"
          onChange={(event) => props.onChange({ amount: maskAmountInput(event.target.value) })}
          placeholder={t('occurrence.settlement.amountPlaceholder')}
          type="text"
          value={props.row.amount}
        />
      </label>
      <AmountLimitNotice value={props.row.amount} />
      {props.hasIssue ? (
        <p className={styles.settlementIssue} role="alert">
          {t('occurrence.settlement.issues.amountRequired')}
        </p>
      ) : null}
    </div>
  )
}

function PayerField(props: FieldProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  return (
    <div className={receivingStyles.fieldGroup}>
      <span className={styles.settlementLabel}>{t('occurrence.settlement.payerField')}</span>
      <Select
        ariaLabel={t('occurrence.settlement.payerAria')}
        disabled={props.isDisabled}
        onChange={(payerKind) =>
          props.onChange({ payerKind: payerKind as CargoSettlementPayerKind })
        }
        options={CARGO_SETTLEMENT_PAYER_KINDS.map((kind) => ({
          label: t(`occurrence.settlement.payer.${kind}`),
          value: kind,
        }))}
        value={props.row.payerKind}
      />
    </div>
  )
}

/** Uma linha do acerto: o item, o valor (com máscara de moeda), quem paga e "Remover". Cada campo mostra o que falta. */
export function CargoCaseSettlementRow(props: CargoCaseSettlementRowProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const field = { isDisabled: props.isDisabled, onChange: props.onChange, row: props.row }

  return (
    <li className={styles.settlementRow} data-settlement-row="">
      <ItemField
        {...field}
        issue={props.issues.find((issue) => issue !== 'amountRequired')}
        options={props.productOptions}
      />
      <AmountField {...field} hasIssue={props.issues.includes('amountRequired')} />
      <PayerField {...field} />
      <div className={styles.settlementRemove}>
        <Button
          aria-label={t('occurrence.settlement.removeLabel', { position: props.position })}
          data-settlement-remove=""
          disabled={props.isDisabled || !props.canRemove}
          onClick={props.onRemove}
          type="button"
          variant="ghost"
        >
          <Icon name="remove" />
          {t('occurrence.settlement.remove')}
        </Button>
      </div>
    </li>
  )
}
