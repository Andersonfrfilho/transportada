/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import styles from '../styles/nfeWorkspace.module.css'

type NfeWorkspaceHeaderProps = Readonly<{
  /** Ação principal da tela: fica no canto direito do cabeçalho, na linha do estado. */
  readonly action?: ReactNode
  readonly status: 'empty' | 'error' | 'forbidden' | 'loading' | 'ready' | 'running'
}>

export function NfeWorkspaceHeader({ action, status }: NfeWorkspaceHeaderProps) {
  const { t } = useTranslation('nfeWorkspace')

  return (
    <header className={styles.workspaceHeader}>
      <p className={styles.eyebrow}>{t('eyebrow')}</p>
      <h1>{t('title')}</h1>
      <p className={styles.headerCopy}>{t('subtitle')}</p>
      <div className={styles.headerBar}>
        <div className={styles.statusRail} aria-label={t('statusLabel')}>
          <span>{t('statusLabel')}</span>
          <strong className={styles[`status${capitalize(status)}`]}>{t(`status.${status}`)}</strong>
        </div>
        {action}
      </div>
    </header>
  )
}

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1)
}
