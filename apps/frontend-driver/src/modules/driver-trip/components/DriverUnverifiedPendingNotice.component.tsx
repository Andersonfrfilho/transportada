/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import styles from '../styles/driverTrip.module.css'

type DriverUnverifiedPendingNoticeProps = Readonly<{
  count: number
  firstRecordedAt: string
  onConfirm: () => void
  onDiscard: () => void
}>

/**
 * "Confirmar em lote" (spec 189 T9.2, decisão do usuário): o que foi registrado sem rede, com a app
 * aberta sem sessão, só sobe depois que o dono — agora autenticado — confirma. Um toque envia
 * tudo; descartar pede confirmação, como a pendência de outra conta.
 */
export function DriverUnverifiedPendingNotice({
  count,
  firstRecordedAt,
  onConfirm,
  onDiscard,
}: DriverUnverifiedPendingNoticeProps) {
  const { t } = useTranslation('driverTrip')
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false)
  const time = new Date(firstRecordedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  function handleDiscard(): void {
    setIsConfirmingDiscard(false)
    onDiscard()
  }

  return (
    <section className={styles.queueBanner} role="status">
      <p>{t('unverifiedPending.notice', { count, time })}</p>
      {isConfirmingDiscard ? (
        <>
          <p role="alert">{t('unverifiedPending.warning')}</p>
          <div className={styles.actions}>
            <Button type="button" onClick={handleDiscard}>
              <Icon name="trash" />
              {t('unverifiedPending.confirmDiscard')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setIsConfirmingDiscard(false)}>
              {t('unverifiedPending.cancel')}
            </Button>
          </div>
        </>
      ) : (
        <div className={styles.actions}>
          <Button type="button" onClick={onConfirm}>
            <Icon name="upload" />
            {t('unverifiedPending.send')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setIsConfirmingDiscard(true)}>
            <Icon name="trash" />
            {t('unverifiedPending.discard')}
          </Button>
        </div>
      )}
    </section>
  )
}
