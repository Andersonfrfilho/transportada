/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import dialogStyles from '../styles/cargoOccurrenceDialog.module.css'

type CargoOccurrenceDialogFooterProps = Readonly<{
  /** O `id` do texto que explica por que registrar está desabilitado; sem ele, o botão só espera o formulário. */
  blockedReasonId: string | undefined
  isLoading: boolean
  isSubmitting: boolean
  onCancel: () => void
  onSubmit: () => void
}>

export function CargoOccurrenceDialogFooter({
  blockedReasonId,
  isLoading,
  isSubmitting,
  onCancel,
  onSubmit,
}: CargoOccurrenceDialogFooterProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')

  return (
    <footer className={dialogStyles.dialogFooter}>
      <Button disabled={isSubmitting} onClick={onCancel} type="button" variant="ghost">
        {t('occurrence.dialog.cancel')}
      </Button>
      <Button
        aria-describedby={blockedReasonId}
        disabled={isSubmitting || isLoading || blockedReasonId !== undefined}
        onClick={onSubmit}
        type="button"
      >
        <Icon name="check" />
        {isSubmitting ? t('occurrence.dialog.submitting') : t('occurrence.dialog.submit')}
      </Button>
    </footer>
  )
}
