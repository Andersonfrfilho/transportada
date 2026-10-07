/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { CARGO_RECEIVING_ERROR } from '../shared/cargoReceiving.constant'
import { resolveOccurrenceErrorKeys } from '../shared/cargoOccurrenceRefusal.service'
import styles from '../styles/cargoOccurrence.module.css'

type CargoNoteFailureProps = Readonly<{
  code: string
  number: string
  onRetry: () => void
}>

/** O que o servidor recusou (ou a rede derrubou) fica na nota com o motivo; só a queda de rede oferece reenviar. */
export function CargoNoteFailure({ code, number, onRetry }: CargoNoteFailureProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const reason = t(resolveOccurrenceErrorKeys(code), { code })

  return (
    <div className={styles.noteFailure} role="alert">
      <span>{t('occurrence.failure', { reason })}</span>
      {code === CARGO_RECEIVING_ERROR.REQUEST_FAILED ? (
        <Button
          aria-label={t('occurrence.actions.retryLabel', { number })}
          className={styles.noteAction}
          onClick={onRetry}
          type="button"
          variant="secondary"
        >
          <Icon name="refresh" />
          {t('occurrence.actions.retry')}
        </Button>
      ) : null}
    </div>
  )
}
