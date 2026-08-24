/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useCountdown } from '@/modules/shared/useCountdown.hook'

import type { NfseInvoiceTableController } from '../hooks/useNfseInvoiceTable.hook'
import styles from '../styles/nfseInvoice.module.css'

type NfseAuthorizationRefreshProps = Readonly<{ table: NfseInvoiceTableController }>

function formatRemaining(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * Só aparece enquanto alguma nota espera a prefeitura. A autorização é assíncrona: o RPS já está
 * lá com protocolo, e quem busca a resposta é o worker. O relógio existe para o operador ver que a
 * tela está acompanhando, em vez de recarregar a página adivinhando se mudou.
 */
export function NfseAuthorizationRefresh({
  table,
}: NfseAuthorizationRefreshProps): JSX.Element | null {
  const { t } = useTranslation('nfseInvoice')
  const refresh = table.authorizationRefresh
  const remainingSeconds = useCountdown({ targetIso: refresh.nextRefreshIso })

  if (refresh.pendingCount === 0) return null

  return (
    <div className={styles.authorizationRefresh}>
      <span className={styles.authorizationRefreshLabel} role="status">
        {t('table.authorizationRefresh.pending', { count: refresh.pendingCount })}
        {refresh.isRefreshing
          ? ` · ${t('table.authorizationRefresh.checking')}`
          : ` · ${t('table.authorizationRefresh.nextIn', {
              remaining: formatRemaining(remainingSeconds),
            })}`}
      </span>
      <Button
        disabled={refresh.isRefreshing}
        onClick={refresh.refreshNow}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Icon aria-hidden="true" name="refresh" />
        {t('table.authorizationRefresh.refreshNow')}
      </Button>
    </div>
  )
}
