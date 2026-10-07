/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { resolveOccurrenceErrorKeys } from '../shared/cargoOccurrenceRefusal.service'
import styles from '../styles/cargoOccurrence.module.css'

/** O que o servidor recusou (ou a rede derrubou) nomeia o motivo: a tela da tratativa nunca fica muda. */
export function CargoCaseFailure({ code }: Readonly<{ code: string }>): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const reason = t(resolveOccurrenceErrorKeys(code), { code })

  return (
    <p className={styles.noteFailure} role="alert">
      {t('occurrence.failure', { reason })}
    </p>
  )
}
