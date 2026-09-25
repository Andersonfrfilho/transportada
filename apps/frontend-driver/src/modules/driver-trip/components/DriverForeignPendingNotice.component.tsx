/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import styles from '../styles/driverTrip.module.css'

type DriverForeignPendingNoticeProps = Readonly<{
  count: number
  onDiscard: () => void
}>

/**
 * ADR-0075 §8: o que outra conta deixou na fila deste celular nunca sai com o token desta. Fica à
 * vista, e "Descartar" pede confirmação com o aviso — apagar é para sempre, e quem registrou perde.
 */
export function DriverForeignPendingNotice({ count, onDiscard }: DriverForeignPendingNoticeProps) {
  const { t } = useTranslation('driverTrip')
  const [isConfirming, setIsConfirming] = useState(false)

  function handleConfirm(): void {
    setIsConfirming(false)
    onDiscard()
  }

  return (
    <section className={styles.rejectedBanner} role="status">
      <p className={styles.profileMeta}>{t('foreignPending.notice', { count })}</p>
      {isConfirming ? (
        <>
          <p role="alert">{t('foreignPending.warning')}</p>
          <div className={styles.actions}>
            <Button type="button" onClick={handleConfirm}>
              <Icon name="trash" />
              {t('foreignPending.confirm')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setIsConfirming(false)}>
              {t('foreignPending.cancel')}
            </Button>
          </div>
        </>
      ) : (
        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={() => setIsConfirming(true)}>
            <Icon name="trash" />
            {t('foreignPending.discard')}
          </Button>
        </div>
      )}
    </section>
  )
}
