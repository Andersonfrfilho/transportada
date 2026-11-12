/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { navigateToTripOccurrence } from '@/modules/trip/shared/tripOccurrenceRoute.service'
import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import type { OccurrenceChargeReportRow } from '../shared/extraCharges.types'
import styles from '../styles/extraCharges.module.css'

/**
 * Spec 317 (RF10, T9): o que a cobrança no recebimento carrega além do valor — as fotos rotuladas por vaga
 * (placa de cobrança e comprovante), quem pagou, o PIX do motorista e o caminho para a ocorrência. O PIX só
 * chega a quem tem `trip.financials`, que é a permissão da própria tela.
 */
/** A linha só ganha o detalhe quando há o que mostrar: a cobrança de nota não tem fotos, PIX nem parada. */
export function hasReceivingChargeDetail(row: OccurrenceChargeReportRow): boolean {
  return row.photos.length > 0 || row.receivingCharge !== null || row.stopOccurrenceId !== null
}

export function ReceivingChargeDetail({
  row,
}: Readonly<{ row: OccurrenceChargeReportRow }>): JSX.Element | null {
  const { t } = useTranslation('extraCharges')
  const charge = row.receivingCharge
  if (!hasReceivingChargeDetail(row)) return null

  return (
    <div className={styles.receivingDetail}>
      {row.photos.length === 0 ? null : (
        <ul aria-label={t('reimbursements.receiving.photos')} className={styles.photoList}>
          {row.photos.map((photo) => (
            <li className={styles.photoItem} key={photo.slotKey}>
              <a
                aria-label={t('reimbursements.receiving.openPhoto', { label: photo.label })}
                href={photo.url}
                rel="noreferrer noopener"
                target="_blank"
              >
                <img
                  alt={photo.label}
                  className={styles.photoThumb}
                  loading="lazy"
                  src={photo.url}
                />
              </a>
              <span className={styles.photoLabel}>{photo.label}</span>
            </li>
          ))}
        </ul>
      )}

      {charge === null || charge.paidBy === null ? null : (
        <p className={styles.hint}>
          {t(`reimbursements.receiving.paidBy.${charge.paidBy}`)}
          {charge.paidBy === 'driver' && charge.driverPixKey !== null ? (
            <>
              {' · '}
              {t('reimbursements.receiving.pix')}:{' '}
              <span className={styles.pixKey}>{charge.driverPixKey}</span>
              {charge.driverPixKeyType === null
                ? null
                : ` (${t(`reimbursements.receiving.pixType.${charge.driverPixKeyType}`, {
                    defaultValue: charge.driverPixKeyType,
                  })})`}
            </>
          ) : null}
        </p>
      )}
      {charge?.driverPayoutSentAt == null ? null : (
        <Badge variant="info">{t('reimbursements.receiving.payoutSent')}</Badge>
      )}

      {row.stopOccurrenceId === null ? null : (
        <Button
          className={styles.occurrenceLink}
          onClick={() =>
            navigateToTripOccurrence({
              navigator: createBrowserWorkspaceNavigator(),
              occurrenceId: row.stopOccurrenceId ?? '',
            })
          }
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name="edit" size="sm" />
          {t('reimbursements.receiving.openOccurrence')}
        </Button>
      )}
    </div>
  )
}
