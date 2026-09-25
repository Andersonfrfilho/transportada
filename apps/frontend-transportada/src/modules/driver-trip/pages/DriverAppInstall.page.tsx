/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import styles from '../styles/driverTrip.module.css'

type DriverAppInstallPageProps = Readonly<{
  driverAppUrl: string
}>

/**
 * ADR-0075 §6: o ícone antigo instalado abre o painel em `standalone`. Um `location.replace` para
 * a casa nova sairia do `scope` do app antigo e cairia numa aba solta, sem ícone e sem o jeito de
 * app — então a tela explica e oferece o link, que abre no navegador, onde se instala o novo.
 */
export function DriverAppInstallPage({ driverAppUrl }: DriverAppInstallPageProps) {
  const { t } = useTranslation('driverTrip')

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <h1>{t('legacy.install.title')}</h1>
      </header>
      <div className={styles.legacyNotice}>
        <p>{t('legacy.install.body')}</p>
        <p>{t('legacy.install.address', { address: new URL(driverAppUrl).host })}</p>
      </div>
      <Button asChild className={styles.legacyGoButton}>
        <a href={driverAppUrl} rel="noopener noreferrer" target="_blank">
          <Icon name="link" />
          {t('legacy.install.open')}
        </a>
      </Button>
    </main>
  )
}
