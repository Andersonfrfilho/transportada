import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useDriverOptions } from '@/modules/fleet/hooks/useDriverOptions.hook'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { useOccurrenceCaseActions } from '../hooks/useOccurrenceCaseActions.hook'
import { useOccurrenceSettlementQuery } from '../queries/tripOccurrenceFeed.query'
import {
  formatOccurrenceSettlementAmount,
  isPositiveDecimalAmount,
  maskAmountFromDecimal,
  maskAmountInput,
  sumOccurrenceSettlementAmounts,
  unmaskAmountInput,
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
  /** Sobe para o painel da tratativa: encerrar com rascunho não gravado perde o acerto digitado. */
  onDraftDirtyChange?: (isDirty: boolean) => void
  occurrenceId: string
}>

type DraftRow = Readonly<{
  /** O valor **mascarado** que o campo mostra (`1.234,56`); o decimal sai de `unmaskAmountInput`. */
  amount: string
  id: string
  payerId: string
  payerKind: OccurrenceSettlementPayerKind
  productCode: string
}>

/** A chave pelo índice fazia o foco pular ao remover uma linha do meio: a identidade é da linha. */
function nextRowId(): string {
  return `row-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`
}

function emptyRow(): DraftRow {
  return { amount: '', id: nextRowId(), payerId: '', payerKind: 'driver', productCode: '' }
}

const dayFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })

function formatReimbursedDay(value: string): string {
  const moment = new Date(value)
  return Number.isNaN(moment.getTime()) ? value : dayFormatter.format(moment)
}

function hasProductCode(row: DraftRow): boolean {
  return row.productCode.trim().length > 0
}

function hasAmount(row: DraftRow): boolean {
  return isPositiveDecimalAmount(unmaskAmountInput(row.amount))
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
 *
 * Revisão de design da T30:
 * - **quem pagou é escolhido pelo nome** (B3). O UUID digitado à mão gravava a dívida no motorista
 *   errado com um dígito trocado, calado. Sem `fleet.read` o campo de texto continua, mas nunca
 *   sozinho: o nome resolvido (ou o aviso de que ele não pôde ser conferido) fica ao lado;
 * - **uma grade só para o bloco** (A1), com a célula do motorista sempre presente — desabilitada
 *   quando não se aplica — e "Remover" em coluna própria, para que as linhas alinhem entre si;
 * - **rótulo visível** (A2): cabeçalho de colunas no desktop, rótulo por campo no celular;
 * - **máscara de moeda pt-BR na digitação** (A3), e linha incompleta **não some em silêncio**: ela
 *   é marcada com `aria-invalid` e mensagem, e o envio inteiro para.
 */
export function OccurrenceSettlementPanel({
  canResolve,
  onDraftDirtyChange,
  occurrenceId,
}: OccurrenceSettlementPanelProps) {
  const { t } = useTranslation('trip')
  const actions = useOccurrenceCaseActions()
  const authQuery = useAuthMeQuery()
  const driverOptions = useDriverOptions({
    enabled: canResolve,
    permissions: authQuery.data?.data.permissions ?? [],
  })
  const settlementQuery = useOccurrenceSettlementQuery({ enabled: canResolve, occurrenceId })
  const [rows, setRows] = useState<readonly DraftRow[]>([emptyRow()])
  const [lastResult, setLastResult] = useState<null | OccurrenceSettlementView>(null)
  const [showValidation, setShowValidation] = useState(false)
  const loadedOccurrenceIdRef = useRef<null | string>(null)

  useEffect(() => {
    if (settlementQuery.data === undefined) return
    if (loadedOccurrenceIdRef.current === occurrenceId) return
    loadedOccurrenceIdRef.current = occurrenceId
    if (settlementQuery.data.items.length === 0) return
    setRows(
      settlementQuery.data.items.map((item) => ({
        amount: maskAmountFromDecimal(item.amount),
        id: nextRowId(),
        payerId: item.payerId ?? '',
        payerKind: item.payerKind,
        productCode: item.productCode,
      })),
    )
    setLastResult(settlementQuery.data)
  }, [occurrenceId, settlementQuery.data])

  const clientTotal = sumOccurrenceSettlementAmounts(
    rows.map((row) => unmaskAmountInput(row.amount)),
  )
  const isBusy = actions.recordSettlement.isPending
  const hasInvalidRow = rows.some((row) => !hasProductCode(row) || !hasAmount(row))

  function publishRows(nextRows: readonly DraftRow[]): void {
    setRows(nextRows)
    onDraftDirtyChange?.(true)
  }

  function updateRow(id: string, patch: Partial<DraftRow>): void {
    publishRows(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  function addRow(): void {
    publishRows([...rows, emptyRow()])
  }

  function removeRow(id: string): void {
    publishRows(rows.filter((row) => row.id !== id))
  }

  /** Linha incompleta parava o envio caladamente — agora ela para o envio **dizendo**. */
  function handleSubmit(): void {
    setShowValidation(true)
    if (hasInvalidRow) return

    const items: OccurrenceSettlementItem[] = rows.map((row) => ({
      amount: unmaskAmountInput(row.amount),
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
          setShowValidation(false)
          onDraftDirtyChange?.(false)
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

  function payerNameOf(payerId: string): string {
    const name = driverOptions.nameOf(payerId)
    if (name !== undefined) return t('occurrenceSettlement.payerResolved', { name })
    if (payerId.trim().length === 0) return ''
    return driverOptions.canReadDrivers
      ? t('occurrenceSettlement.payerUnresolved')
      : t('occurrenceSettlement.payerManualHint')
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

      <div className={styles.settlementGrid}>
        <div className={styles.settlementColumns}>
          <span>{t('occurrenceSettlement.productCode')}</span>
          <span>{t('occurrenceSettlement.amount')}</span>
          <span>{t('occurrenceSettlement.payerKind')}</span>
          <span>{t('occurrenceSettlement.payerId')}</span>
          <span />
        </div>

        {rows.map((row) => {
          const productCodeInvalid = showValidation && !hasProductCode(row)
          const amountInvalid = showValidation && !hasAmount(row)
          const isDriverPayer = row.payerKind === 'driver'

          return (
            <div className={styles.settlementRow} key={row.id}>
              <label className={styles.settlementField}>
                <span className={styles.settlementFieldLabel}>
                  {t('occurrenceSettlement.productCode')}
                </span>
                <input
                  aria-invalid={productCodeInvalid}
                  aria-label={t('occurrenceSettlement.productCode')}
                  onChange={(event) => updateRow(row.id, { productCode: event.target.value })}
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
                <span className={styles.settlementFieldLabel}>
                  {t('occurrenceSettlement.amount')}
                </span>
                <input
                  aria-invalid={amountInvalid}
                  aria-label={t('occurrenceSettlement.amount')}
                  inputMode="decimal"
                  onChange={(event) =>
                    updateRow(row.id, { amount: maskAmountInput(event.target.value) })
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
                <span className={styles.settlementFieldLabel}>
                  {t('occurrenceSettlement.payerKind')}
                </span>
                <Select
                  ariaLabel={t('occurrenceSettlement.payerKind')}
                  onChange={(value) =>
                    updateRow(row.id, { payerKind: value as OccurrenceSettlementPayerKind })
                  }
                  options={OCCURRENCE_SETTLEMENT_PAYER_KINDS.map((kind) => ({
                    label: t(`occurrenceSettlement.payer.${kind}`),
                    value: kind,
                  }))}
                  value={row.payerKind}
                />
              </div>

              {/*
               * A célula do motorista está **sempre** aqui, desabilitada quando não se aplica: com
               * ela aparecendo e sumindo, "Remover" de uma linha caía na coluna do pagador da outra.
               */}
              <div className={styles.settlementField}>
                <span className={styles.settlementFieldLabel}>
                  {t('occurrenceSettlement.payerId')}
                </span>
                {driverOptions.canReadDrivers ? (
                  <Select
                    ariaLabel={t('occurrenceSettlement.payerId')}
                    disabled={!isDriverPayer}
                    emptyLabel={t('occurrenceSettlement.payerEmpty')}
                    onChange={(value) => updateRow(row.id, { payerId: value })}
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
                      onChange={(event) => updateRow(row.id, { payerId: event.target.value })}
                      type="text"
                      value={isDriverPayer ? row.payerId : ''}
                    />
                    <span className={styles.settlementFieldHint}>{payerNameOf(row.payerId)}</span>
                  </>
                )}
              </div>

              <div className={styles.settlementRemove}>
                <Button
                  disabled={rows.length === 1}
                  onClick={() => removeRow(row.id)}
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
        })}
      </div>

      {showValidation && hasInvalidRow ? (
        <p className={styles.occurrenceInvalidRows} role="alert">
          {t('occurrenceSettlement.invalidRows')}
        </p>
      ) : null}

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
          <div className={styles.settlementGrid}>
            <div className={styles.settlementColumns}>
              <span>{t('occurrenceSettlement.productCode')}</span>
              <span>{t('occurrenceSettlement.amount')}</span>
              <span>{t('occurrenceSettlement.payerKind')}</span>
              <span>{t('occurrenceSettlement.payerId')}</span>
              <span />
            </div>
            {lastResult.items.map((item) => (
              <div className={styles.settlementRow} key={item.productCode}>
                <span>{item.productCode}</span>
                <span>{formatOccurrenceSettlementAmount(item.amount)}</span>
                <span>{t(`occurrenceSettlement.payer.${item.payerKind}`)}</span>
                <span>
                  {item.payerKind === 'driver'
                    ? (driverOptions.nameOf(item.payerId ?? '') ?? item.payerId ?? '')
                    : ''}
                </span>
                <div className={styles.settlementRemove}>
                  {/*
                   * O botão sumia e não deixava nada no lugar — quem ressarciu não tinha como saber
                   * se o clique valeu. Agora o item ressarcido carrega a data.
                   */}
                  {item.reimbursedAt !== null ? (
                    <span className={styles.settlementReimbursedBadge}>
                      <Icon name="check" />
                      {t('occurrenceSettlement.reimbursedOn', {
                        date: formatReimbursedDay(item.reimbursedAt),
                      })}
                    </span>
                  ) : item.payerKind === 'carrier' ? null : (
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
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
