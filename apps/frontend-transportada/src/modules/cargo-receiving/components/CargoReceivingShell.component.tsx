/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import styles from '../styles/cargoReceiving.module.css'

type CargoReceivingShellProps = Readonly<{
  actions?: ReactNode
  children: ReactNode
  hint?: string
  title: string
}>

/** O cabeçalho em painel das telas do escritório (lista e registro), no molde de Clientes e Ocorrências. */
export function CargoReceivingShell({
  actions,
  children,
  hint,
  title,
}: CargoReceivingShellProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        {actions === undefined ? null : <div className={styles.backRow}>{actions}</div>}
        <p className={styles.kicker}>{t('eyebrow')}</p>
        <h1>{title}</h1>
        {hint === undefined ? null : <p className={styles.hint}>{hint}</p>}
      </header>
      {children}
    </main>
  )
}
