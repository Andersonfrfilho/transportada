/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon, type IconName } from '@/components/ui/icon'

import type { CargoNoteActions } from '../shared/cargoNoteActions.service'
import styles from '../styles/cargoOccurrence.module.css'

type CargoNoteActionButtonsProps = Readonly<{
  actions: CargoNoteActions
  isMarking: boolean
  isPending: boolean
  number: string
  onComplete: () => void
  onMark: () => void
  onOpen: (() => void) | undefined
  onUnmark: () => void
}>

type NoteButton = Readonly<{
  icon: IconName
  isDisabled: boolean
  isVisible: boolean
  key: 'complete' | 'mark' | 'open' | 'unmark'
  onClick: (() => void) | undefined
  variant: 'default' | 'ghost' | 'secondary'
}>

function listNoteButtons(props: CargoNoteActionButtonsProps): readonly NoteButton[] {
  const { actions, isMarking, isPending } = props
  return [
    {
      icon: 'alert',
      isDisabled: false,
      isVisible: props.onOpen !== undefined && actions.canOpenOccurrence,
      key: 'open',
      onClick: props.onOpen,
      variant: 'secondary',
    },
    {
      icon: 'truck',
      isDisabled: isPending,
      isVisible: actions.canMark && !isMarking,
      key: 'mark',
      onClick: props.onMark,
      variant: 'secondary',
    },
    {
      icon: 'check',
      isDisabled: isPending,
      isVisible: actions.canComplete,
      key: 'complete',
      onClick: props.onComplete,
      variant: 'default',
    },
    {
      icon: 'close',
      isDisabled: isPending,
      isVisible: actions.canUnmark,
      key: 'unmark',
      onClick: props.onUnmark,
      variant: 'ghost',
    },
  ]
}

/** Os botões da nota, na ordem do fluxo: avaria → devolver → concluir → desfazer. Cada um só existe se o papel e o estado permitem. */
export function CargoNoteActionButtons(props: CargoNoteActionButtonsProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')

  return (
    <div className={styles.noteButtons}>
      {listNoteButtons(props)
        .filter((button) => button.isVisible)
        .map((button) => (
          <Button
            aria-label={t(`occurrence.actions.${button.key}Label`, { number: props.number })}
            className={styles.noteAction}
            disabled={button.isDisabled}
            key={button.key}
            onClick={button.onClick}
            type="button"
            variant={button.variant}
          >
            <Icon name={button.icon} />
            {t(`occurrence.actions.${button.key}`)}
          </Button>
        ))}
    </div>
  )
}
