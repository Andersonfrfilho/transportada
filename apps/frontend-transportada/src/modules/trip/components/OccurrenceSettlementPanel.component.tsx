/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'

import { useOccurrenceCaseActions } from '../hooks/useOccurrenceCaseActions.hook'
import {
  formatOccurrenceSettlementAmount,
  isPositiveDecimalAmount,
  sumOccurrenceSettlementAmounts,
} from '../shared/occurrenceSettlementMoney.service'
import {
  OCCURRENCE_SETTLEMENT_PAYER_KINDS,
  type OccurrenceSettlementItem,
  type OccurrenceSettlementPayerKind,
  type OccurrenceSettlementResult,
} from '../shared/tripOccurrenceFeed.service'
import styles from '../styles/trip.module.css'

export type OccurrenceSettlementPanelProps = Readonly<{
  canResolve: boolean
  occurrenceId: string
}>

type DraftRow = Readonly<{
  amount: string
  payerId: string
  payerKind: OccurrenceSettlementPayerKind
  productCode: string
}>

function emptyRow(): DraftRow {
  return { amount: '', payerId: '', payerKind: 'driver', productCode: '' }
}

/**
 * Spec 164 T23 (RF22-RF25): itens do acerto — código do produto, valor (sempre digitado aqui,
 * `amountSource: 'manual'` — esta tela não tem de onde ler o `vUnCom` da nota sem um endpoint que a
 * API ainda não publica para o feed de ocorrências), quem pagou, e o total somado em `BigInt`
 * (`occurrenceSettlementMoney.service.ts`), nunca em `number`. `payerKind: 'carrier'` esconde o
 * botão de ressarcimento em vez de deixar o clique estourar 422 (critério de aceite da T23).
 *
 * ⚠️ Sem `GET` para ler o acerto já gravado (a API só expõe `PUT` que substitui e `POST` de
 * ressarcimento), a tela nasce com o formulário vazio a cada abertura — ela não sabe o que já foi
 * salvo antes de o operador digitar de novo. É lacuna do backend, registrada aqui em vez de
 * fingida com um estado inventado.
 */
export function OccurrenceSettlementPanel({
  canResolve,
  occurrenceId,
}: OccurrenceSettlementPanelProps) {
  const { t } = useTranslation('trip')
  const actions = useOccurrenceCaseActions()
  const [rows, setRows] = useState<readonly DraftRow[]>([emptyRow()])
  const [lastResult, setLastResult] = useState<null | OccurrenceSettlementResult>(null)

  const clientTotal = sumOccurrenceSettlementAmounts(rows.map((row) => row.amount))
  const isBusy = actions.recordSettlement.isPending

  function updateRow(index: number, patch: Partial<DraftRow>): void {
    setRows(rows.map((row, current) => (current === index ? { ...row, ...patch } : row)))
  }

  function addRow(): void {
    setRows([...rows, emptyRow()])
  }

  function removeRow(index: number): void {
    setRows(rows.filter((_row, current) => current !== index))
  }

  function handleSubmit(): void {
    const items: OccurrenceSettlementItem[] = rows
      .filter((row) => row.productCode.trim().length > 0 && isPositiveDecimalAmount(row.amount))
      .map((row) => ({
        amount: row.amount.trim(),
        amountSource: 'manual',
        payerKind: row.payerKind,
        productCode: row.productCode.trim(),
        ...(row.payerKind === 'driver' && row.payerId.trim().length > 0
          ? { payerId: row.payerId.trim() }
          : {}),
      }))
    actions.recordSettlement.mutate({ items, occurrenceId }, { onSuccess: setLastResult })
  }

  function handleReimburse(productCode: string): void {
    actions.reimburse.mutate({ occurrenceId, productCode })
  }

  if (!canResolve) return null

  return (
    <div className={styles.occurrenceStage}>
      <h4 className={styles.hint}>{t('occurrenceSettlement.title')}</h4>

      {rows.map((row, index) => (
        <div className={styles.occurrenceFormRow} key={index}>
          <input
            aria-label={t('occurrenceSettlement.productCode')}
            onChange={(event) => updateRow(index, { productCode: event.target.value })}
            placeholder={t('occurrenceSettlement.productCode')}
            type="text"
            value={row.productCode}
          />
          <input
            aria-label={t('occurrenceSettlement.amount')}
            inputMode="decimal"
            onChange={(event) => updateRow(index, { amount: event.target.value })}
            placeholder={t('occurrenceSettlement.amountPlaceholder')}
            type="text"
            value={row.amount}
          />
          <Select
            ariaLabel={t('occurrenceSettlement.payerKind')}
            onChange={(value) =>
              updateRow(index, { payerKind: value as OccurrenceSettlementPayerKind })
            }
            options={OCCURRENCE_SETTLEMENT_PAYER_KINDS.map((kind) => ({
              label: t(`occurrenceSettlement.payer.${kind}`),
              value: kind,
            }))}
            value={row.payerKind}
          />
          {row.payerKind === 'driver' ? (
            <input
              aria-label={t('occurrenceSettlement.payerId')}
              onChange={(event) => updateRow(index, { payerId: event.target.value })}
              placeholder={t('occurrenceSettlement.payerIdPlaceholder')}
              type="text"
              value={row.payerId}
            />
          ) : null}
          <Button
            disabled={rows.length === 1}
            onClick={() => removeRow(index)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="remove" />
            {t('occurrenceSettlement.removeRow')}
          </Button>
        </div>
      ))}

      <div className={styles.occurrenceFormActions}>
        <Button onClick={addRow} size="sm" type="button" variant="secondary">
          <Icon name="add" />
          {t('occurrenceSettlement.addRow')}
        </Button>
      </div>

      <p className={styles.hint}>
        {t('occurrenceSettlement.total')}:{' '}
        <strong>{formatOccurrenceSettlementAmount(clientTotal)}</strong>
      </p>

      <div className={styles.occurrenceFormActions}>
        <Button disabled={isBusy} onClick={handleSubmit} size="sm" type="button">
          <Icon name="save" />
          {t('occurrenceSettlement.save')}
        </Button>
      </div>

      {lastResult !== null ? (
        <div>
          <p className={styles.hint} role="status">
            {t('occurrenceSettlement.savedTotal')}:{' '}
            <strong>{formatOccurrenceSettlementAmount(lastResult.total)}</strong>
          </p>
          {lastResult.items.map((item) => (
            <div className={styles.occurrenceFormRow} key={item.productCode}>
              <span>{item.productCode}</span>
              <span>{formatOccurrenceSettlementAmount(item.amount)}</span>
              <span>{t(`occurrenceSettlement.payer.${item.payerKind}`)}</span>
              {item.payerKind === 'carrier' ? null : (
                <Button
                  disabled={actions.reimburse.isPending}
                  onClick={() => handleReimburse(item.productCode)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  <Icon name="check" />
                  {t('occurrenceSettlement.markReimbursed')}
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
