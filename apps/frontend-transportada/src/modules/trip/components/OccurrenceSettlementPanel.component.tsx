/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

import { useOccurrenceCaseActions } from '../hooks/useOccurrenceCaseActions.hook'
import { useOccurrenceSettlementQuery } from '../queries/tripOccurrenceFeed.query'
import {
  formatOccurrenceSettlementAmount,
  isPositiveDecimalAmount,
  sumOccurrenceSettlementAmounts,
} from '../shared/occurrenceSettlementMoney.service'
import {
  OCCURRENCE_SETTLEMENT_PAYER_KINDS,
  type OccurrenceSettlementItem,
  type OccurrenceSettlementPayerKind,
  type OccurrenceSettlementView,
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
 * Achado 2 da revisão: `GET /trip-occurrences/:id/case/settlement` traz o que já foi gravado —
 * o painel abre com o acerto existente em vez de sempre vazio. O carregamento inicial só acontece
 * uma vez por ocorrência (`loadedOccurrenceIdRef`), para não sobrescrever o que o operador está
 * digitando quando a consulta refaz depois de salvar/ressarcir.
 */
export function OccurrenceSettlementPanel({
  canResolve,
  occurrenceId,
}: OccurrenceSettlementPanelProps) {
  const { t } = useTranslation('trip')
  const actions = useOccurrenceCaseActions()
  const settlementQuery = useOccurrenceSettlementQuery({ enabled: canResolve, occurrenceId })
  const [rows, setRows] = useState<readonly DraftRow[]>([emptyRow()])
  const [lastResult, setLastResult] = useState<null | OccurrenceSettlementView>(null)
  const loadedOccurrenceIdRef = useRef<null | string>(null)

  useEffect(() => {
    if (settlementQuery.data === undefined) return
    if (loadedOccurrenceIdRef.current === occurrenceId) return
    loadedOccurrenceIdRef.current = occurrenceId
    if (settlementQuery.data.items.length === 0) return
    setRows(
      settlementQuery.data.items.map((item) => ({
        amount: item.amount,
        payerId: item.payerId ?? '',
        payerKind: item.payerKind,
        productCode: item.productCode,
      })),
    )
    setLastResult(settlementQuery.data)
  }, [occurrenceId, settlementQuery.data])

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
    actions.recordSettlement.mutate(
      { items, occurrenceId },
      {
        /** `PUT` substitui a lista inteira — os itens gravados nascem sempre não ressarcidos. */
        onSuccess: (result) => {
          setLastResult({
            items: result.items.map((item) => ({ ...item, reimbursedAt: null })),
            total: result.total,
          })
        },
      },
    )
  }

  function handleReimburse(productCode: string): void {
    actions.reimburse.mutate({ occurrenceId, productCode })
  }

  if (!canResolve) return null

  if (settlementQuery.isLoading) {
    return (
      <div className={styles.occurrenceStage}>
        <h4 className={styles.hint}>{t('occurrenceSettlement.title')}</h4>
        <Skeleton height="2.5rem" />
      </div>
    )
  }

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
              {item.payerKind === 'carrier' || item.reimbursedAt !== null ? null : (
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
