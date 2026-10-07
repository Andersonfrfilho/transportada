/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import type { DriverOptionsController } from '@/modules/fleet/hooks/useDriverOptions.hook'

import {
  hasSettlementAmount,
  hasSettlementProductCode,
  type OccurrenceSettlementDraftRow,
} from '../shared/occurrenceSettlementDraft.service'
import { maskAmountInput } from '../shared/occurrenceSettlementMoney.service'
import {
  OCCURRENCE_SETTLEMENT_PAYER_KINDS,
  type OccurrenceSettlementPayerKind,
} from '../shared/tripOccurrenceFeed.service'
import styles from '../styles/trip.module.css'

export type OccurrenceSettlementRowProps = Readonly<{
  driverOptions: DriverOptionsController
  isValidationShown: boolean
  onChange: (id: string, patch: Partial<OccurrenceSettlementDraftRow>) => void
  /** Ausente quando é a única linha: sem ela o acerto ficaria sem onde digitar. */
  onRemove: ((id: string) => void) | undefined
  row: OccurrenceSettlementDraftRow
}>

/**
 * Uma linha do rascunho do acerto (spec 164 T23/T30): código, valor com máscara pt-BR, quem pagou — pelo nome —
 * e a célula do motorista **sempre** presente, desabilitada quando não se aplica, para as linhas alinharem.
 */
export function OccurrenceSettlementRow({
  driverOptions,
  isValidationShown,
  onChange,
  onRemove,
  row,
}: OccurrenceSettlementRowProps) {
  const { t } = useTranslation('trip')
  const productCodeInvalid = isValidationShown && !hasSettlementProductCode(row)
  const amountInvalid = isValidationShown && !hasSettlementAmount(row)
  const isDriverPayer = row.payerKind === 'driver'

  function payerNameOf(payerId: string): string {
    const name = driverOptions.nameOf(payerId)
    if (name !== undefined) return t('occurrenceSettlement.payerResolved', { name })
    if (payerId.trim().length === 0) return ''
    return driverOptions.canReadDrivers
      ? t('occurrenceSettlement.payerUnresolved')
      : t('occurrenceSettlement.payerManualHint')
  }

  return (
    <div className={styles.settlementRow}>
      <label className={styles.settlementField}>
        <span className={styles.settlementFieldLabel}>{t('occurrenceSettlement.productCode')}</span>
        <input
          aria-invalid={productCodeInvalid}
          aria-label={t('occurrenceSettlement.productCode')}
          onChange={(event) => onChange(row.id, { productCode: event.target.value })}
          type="text"
          value={row.productCode}
        />
        {productCodeInvalid ? (
          <span className={styles.settlementFieldError}>
            {t('occurrenceSettlement.productCodeRequired')}
          </span>
        ) : null}
      </label>

      <label className={styles.settlementField}>
        <span className={styles.settlementFieldLabel}>{t('occurrenceSettlement.amount')}</span>
        <input
          aria-invalid={amountInvalid}
          aria-label={t('occurrenceSettlement.amount')}
          inputMode="decimal"
          onChange={(event) =>
            onChange(row.id, {
              amount: maskAmountInput(event.target.value),
              amountSource: 'manual',
            })
          }
          placeholder={t('occurrenceSettlement.amountPlaceholder')}
          type="text"
          value={row.amount}
        />
        {amountInvalid ? (
          <span className={styles.settlementFieldError}>
            {t('occurrenceSettlement.amountRequired')}
          </span>
        ) : null}
      </label>

      <div className={styles.settlementField}>
        <span className={styles.settlementFieldLabel}>{t('occurrenceSettlement.payerKind')}</span>
        <Select
          ariaLabel={t('occurrenceSettlement.payerKind')}
          onChange={(value) =>
            onChange(row.id, { payerKind: value as OccurrenceSettlementPayerKind })
          }
          options={OCCURRENCE_SETTLEMENT_PAYER_KINDS.map((kind) => ({
            label: t(`occurrenceSettlement.payer.${kind}`),
            value: kind,
          }))}
          value={row.payerKind}
        />
      </div>

      <div className={styles.settlementField}>
        <span className={styles.settlementFieldLabel}>{t('occurrenceSettlement.payerId')}</span>
        {driverOptions.canReadDrivers ? (
          <Select
            ariaLabel={t('occurrenceSettlement.payerId')}
            disabled={!isDriverPayer}
            emptyLabel={t('occurrenceSettlement.payerEmpty')}
            onChange={(value) => onChange(row.id, { payerId: value })}
            options={driverOptions.drivers.map((driver) => ({
              label: driver.name,
              value: driver.id,
            }))}
            placeholder={
              isDriverPayer
                ? t('occurrenceSettlement.payerIdPlaceholder')
                : t('occurrenceSettlement.payerNotApplicable')
            }
            searchPlaceholder={t('occurrenceSettlement.payerSearch')}
            value={isDriverPayer ? row.payerId : ''}
          />
        ) : (
          <>
            <input
              aria-label={t('occurrenceSettlement.payerId')}
              disabled={!isDriverPayer}
              onChange={(event) => onChange(row.id, { payerId: event.target.value })}
              type="text"
              value={isDriverPayer ? row.payerId : ''}
            />
            <span className={styles.settlementFieldHint}>{payerNameOf(row.payerId)}</span>
          </>
        )}
      </div>

      <div className={styles.settlementRemove}>
        <Button
          disabled={onRemove === undefined}
          onClick={() => onRemove?.(row.id)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name="remove" />
          {t('occurrenceSettlement.removeRow')}
        </Button>
      </div>
    </div>
  )
}
