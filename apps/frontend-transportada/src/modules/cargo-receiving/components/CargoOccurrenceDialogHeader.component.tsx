/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import dialogStyles from '../styles/cargoOccurrenceDialog.module.css'

type CargoOccurrenceDialogHeaderProps = Readonly<{
  isDisabled: boolean
  number: string
  onClose: () => void
  titleId: string
}>

/** O título diz de que nota é a avaria; fechar fica travado enquanto o envio está em voo. */
export function CargoOccurrenceDialogHeader({
  isDisabled,
  number,
  onClose,
  titleId,
}: CargoOccurrenceDialogHeaderProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')

  return (
    <header className={dialogStyles.dialogHeader}>
      <h2 id={titleId}>{t('occurrence.dialog.title', { number })}</h2>
      <button
        aria-label={t('occurrence.dialog.close')}
        className={dialogStyles.iconAction}
        disabled={isDisabled}
        onClick={onClose}
        type="button"
      >
        <Icon name="close" />
      </button>
    </header>
  )
}
