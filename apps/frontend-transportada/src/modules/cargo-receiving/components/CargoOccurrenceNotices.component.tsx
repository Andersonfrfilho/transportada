/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { useCargoOccurrence } from '../hooks/useCargoOccurrence.hook'
import styles from '../styles/cargoReceiving.module.css'

/** Os dois avisos da avaria na chegada: o prazo acabou (neutro, uma vez só) e a leitura das avarias que falhou. */
export function CargoOccurrenceNotices(): JSX.Element | null {
  const { t } = useTranslation('cargoReceiving')
  const occurrence = useCargoOccurrence()
  if (!occurrence.isWindowClosed && !occurrence.hasFailed) return null

  return (
    <>
      {occurrence.isWindowClosed ? (
        <p className={styles.notice} data-window-closed="">
          {t('occurrence.hints.windowClosed')}
        </p>
      ) : null}
      {occurrence.hasFailed ? (
        <p className={styles.error} role="alert">
          {t('occurrence.loadFailed')}
        </p>
      ) : null}
    </>
  )
}
