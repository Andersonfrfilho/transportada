/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import styles from '../styles/driverTrip.module.css'

type DriverServiceWorkerUpdateNoticeProps = Readonly<{
  onApply: () => void
}>

/**
 * Plan D2: depois da primeira captura da sessão, a versão nova para de se aplicar sozinha — o aviso
 * pede o toque, e `onApply` só aplica de verdade se o registro de capturas estiver ocioso (senão
 * espera o `close`, em `serviceWorkerUpdate.service.ts`).
 */
export function DriverServiceWorkerUpdateNotice({ onApply }: DriverServiceWorkerUpdateNoticeProps) {
  const { t } = useTranslation('driverTrip')

  return (
    <div className={styles.queueBanner} role="status">
      <p>{t('serviceWorkerUpdate.available')}</p>
      <Button onClick={onApply} type="button">
        <Icon name="refresh" />
        {t('serviceWorkerUpdate.apply')}
      </Button>
    </div>
  )
}
