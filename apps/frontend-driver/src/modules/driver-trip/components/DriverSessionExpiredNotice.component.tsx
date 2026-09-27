/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { SessionExpiryState } from '../hooks/useSessionExpiry.hook'
import styles from '../styles/driverTrip.module.css'

type DriverSessionExpiredNoticeProps = Readonly<{
  onReauthenticate: () => void
  state: Exclude<SessionExpiryState, 'active'>
}>

/**
 * A sessão venceu: o que está na fila continua no aparelho e sobe depois de entrar. Com uma captura
 * aberta, o toque espera ela fechar — e a tela diz isso, em vez de parecer que não respondeu.
 */
export function DriverSessionExpiredNotice({
  onReauthenticate,
  state,
}: DriverSessionExpiredNoticeProps) {
  const { t } = useTranslation('driverTrip')

  return (
    <div className={styles.queueBanner} role="alert">
      <p>{t('sessionExpired.notice')}</p>
      {state === 'waiting-capture' ? (
        <p>{t('sessionExpired.waitingCapture')}</p>
      ) : (
        <Button onClick={onReauthenticate} type="button">
          <Icon aria-hidden="true" name="login" />
          {t('sessionExpired.signIn')}
        </Button>
      )}
    </div>
  )
}
