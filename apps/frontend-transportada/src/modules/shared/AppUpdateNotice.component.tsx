/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useSyncExternalStore, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { appUpdateStore } from './appUpdate.service'
import styles from './appUpdateNotice.module.css'

/** Faixa fixa no rodapé: só aparece quando há versão nova esperando; o clique é quem recarrega. */
export function AppUpdateNotice(): JSX.Element | null {
  const { t } = useTranslation('appUpdate')
  const isReady = useSyncExternalStore(appUpdateStore.subscribe, appUpdateStore.isReady)
  if (!isReady) return null
  return (
    <div className={styles.notice} role="status">
      <p className={styles.message}>{t('message')}</p>
      <Button onClick={() => void appUpdateStore.apply()} size="sm" type="button">
        <Icon name="refresh" />
        {t('reload')}
      </Button>
    </div>
  )
}
