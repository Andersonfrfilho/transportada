/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { FileField } from '@/components/ui/file-field'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'
import { formatAmount } from '@/modules/shared/decimalAmount.service'

import { sumSelectedReimbursementAmounts } from '../shared/occurrenceReimbursementSelection.service'
import { getExtraChargesClient } from '../shared/extraChargesClient.service'
import styles from '../styles/extraCharges.module.css'

const FINANCIALS_PERMISSION = 'trip.financials'
const RECEIVING_CHARGE_QUERY_KEY = 'receiving-charge-for-resolution'
const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'

type DriverPayoutReceiptFieldProps = Readonly<{
  disabled: boolean
  file: File | null
  onChange: (file: File | null) => void
  stopOccurrenceId: string
}>

/**
 * Spec 317 (E13, T10): na tela de concluir a ocorrência de parada paga pelo motorista, mostra o valor e o PIX dele e
 * oferece o campo **opcional** "Comprovante do PIX". Concluir nunca depende dele. Só aparece para quem tem
 * `trip.financials` (o PIX é dado financeiro) e quando a cobrança é do motorista; nos demais casos não ocupa a tela.
 *
 * A linha vem do relatório de Ressarcimentos (a API não expõe a cobrança no detalhe da ocorrência): linha já
 * fechada em lote sai do relatório, e então o campo não aparece — a conclusão segue igual.
 */
export function DriverPayoutReceiptField({
  disabled,
  file,
  onChange,
  stopOccurrenceId,
}: DriverPayoutReceiptFieldProps): JSX.Element | null {
  const { t } = useTranslation('extraCharges')
  const authQuery = useAuthMeQuery()
  const canSeeFinancials = authQuery.data?.data.permissions.includes(FINANCIALS_PERMISSION) === true

  const reportQuery = useQuery({
    enabled: canSeeFinancials,
    queryFn: () =>
      getExtraChargesClient().readOccurrenceChargeReport({
        chargeType: 'receiving_charge',
        limit: 100,
      }),
    queryKey: [RECEIVING_CHARGE_QUERY_KEY],
  })
  const rows = (reportQuery.data?.items ?? []).filter(
    (row) => row.stopOccurrenceId === stopOccurrenceId && row.receivingCharge?.paidBy === 'driver',
  )
  const charge = rows[0]?.receivingCharge
  if (charge === undefined || charge === null) return null
  const total = sumSelectedReimbursementAmounts(rows, new Set(rows.map((row) => row.id)))

  return (
    <div className={styles.receivingDetail}>
      <p className={styles.hint}>
        {t('payoutReceipt.summary', {
          total: formatAmount(total),
        })}
      </p>
      {charge.driverPixKey === null ? null : (
        <p className={styles.hint}>
          {t('reimbursements.receiving.pix')}:{' '}
          <span className={styles.pixKey}>{charge.driverPixKey}</span>
        </p>
      )}
      <FileField
        accept={RECEIPT_ACCEPT}
        actionLabel={t('payoutReceipt.choose')}
        disabled={disabled}
        {...(file === null ? {} : { fileName: file.name })}
        label={t('payoutReceipt.label')}
        onSelect={(picked) => onChange(picked ?? null)}
        optional
        optionalMark={t('payoutReceipt.optional')}
        placeholder={t('payoutReceipt.placeholder')}
        resetAfterSelect
      />
      <p className={styles.hint}>{t('payoutReceipt.hint')}</p>
    </div>
  )
}
