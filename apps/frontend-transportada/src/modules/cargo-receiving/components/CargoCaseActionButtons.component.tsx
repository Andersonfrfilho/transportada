/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon, type IconName } from '@/components/ui/icon'

import type { CargoCasePanelKind } from '../hooks/useCargoCaseItem.hook'
import type { CargoCaseActions } from '../shared/cargoOccurrenceCase.service'
import type { CargoCaseAction } from '../shared/cargoOccurrenceCase.types'
import styles from '../styles/cargoOccurrence.module.css'

type CargoCaseActionButtonsProps = Readonly<{
  actions: CargoCaseActions
  isBlocked: boolean
  isPending: boolean
  noteNumber: string | undefined
  onOpenPanel: (kind: CargoCasePanelKind) => void
  onReview: () => void
  typeName: string
}>

type CaseButton = Readonly<{
  action: CargoCaseAction
  icon: IconName
  isVisible: boolean
  labelKey: string
  variant: 'default' | 'ghost' | 'secondary'
}>

function listCaseButtons(actions: CargoCaseActions): readonly CaseButton[] {
  return [
    {
      action: 'review',
      icon: 'check',
      isVisible: actions.canReview,
      labelKey: 'review',
      variant: 'default',
    },
    {
      action: 'submit',
      icon: 'send',
      isVisible: actions.canSubmit,
      labelKey: 'submit',
      variant: 'default',
    },
    {
      action: 'decide',
      icon: 'shield',
      isVisible: actions.canDecide,
      labelKey: 'decide',
      variant: 'default',
    },
    {
      action: 'close',
      icon: 'check',
      isVisible: actions.canClose,
      labelKey: 'close',
      variant: 'default',
    },
    {
      action: 'warehouse-return',
      icon: 'refresh',
      isVisible: actions.canReturnToWarehouse,
      labelKey: 'warehouseReturn',
      variant: 'secondary',
    },
    {
      action: 'cancel',
      icon: 'trash',
      isVisible: actions.canCancel,
      labelKey: 'cancel',
      variant: 'secondary',
    },
  ]
}

/** As ações que o estado e a permissão permitem, na ordem do fluxo; com uma ação em voo, todas travam (sem toque duplo). */
export function CargoCaseActionButtons(props: CargoCaseActionButtonsProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const number = props.noteNumber ?? '—'

  function handleClick(action: CargoCaseAction): void {
    if (action === 'review') props.onReview()
    else props.onOpenPanel(action)
  }

  return (
    <div className={styles.noteButtons}>
      {listCaseButtons(props.actions)
        .filter((button) => button.isVisible)
        .map((button) => (
          <Button
            aria-label={t(`occurrence.caseActions.${button.labelKey}Label`, {
              number,
              type: props.typeName,
            })}
            className={styles.noteAction}
            data-case-action={button.action}
            disabled={props.isPending || (button.action === 'close' && props.isBlocked)}
            key={button.action}
            onClick={() => handleClick(button.action)}
            type="button"
            variant={button.variant}
          >
            <Icon name={button.icon} />
            {t(`occurrence.caseActions.${button.labelKey}`)}
          </Button>
        ))}
    </div>
  )
}
