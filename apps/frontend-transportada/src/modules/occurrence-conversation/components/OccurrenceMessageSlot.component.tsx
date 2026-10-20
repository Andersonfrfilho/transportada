/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantMessageActionsTarget } from '@adatechnology/conversations-ui/participant'
import type { MouseEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { MessageSelectionState } from '../shared/useMessageSelection.hook'
import styles from '../styles/occurrenceThread.module.css'
import { OccurrenceMessageMenu } from './OccurrenceMessageMenu.component'

type OccurrenceMessageSlotProps = Readonly<{
  attachmentUrls: ReadonlyMap<string, string>
  canForward: boolean
  from: 'contractor' | 'driver'
  message: ParticipantMessageActionsTarget
  occurrenceId: string
  portalAvailable?: boolean
  selection: MessageSelectionState
}>

/**
 * O que o painel põe no fim de cada balão: o interruptor de marcar a mensagem (invisível, menos para quem chega por
 * Tab) e, com só esta marcada, os três pontos com as opções. Nada aparece no balão sem ninguém pedir.
 */
export function OccurrenceMessageSlot({
  attachmentUrls,
  canForward,
  from,
  message,
  occurrenceId,
  portalAvailable = false,
  selection,
}: OccurrenceMessageSlotProps) {
  const { t } = useTranslation('occurrenceConversation')
  const isSelected = selection.selected.has(message.id)
  const showMenu = isSelected && selection.selected.size === 1
  return (
    <span className={styles.messageSlot}>
      <button
        aria-label={t('selection.toggle')}
        aria-pressed={isSelected}
        className={styles.messageSelectToggle}
        data-message-select="true"
        data-message-selected={isSelected ? 'true' : 'false'}
        onClick={() => selection.toggle(message)}
        type="button"
      />
      {showMenu ? (
        <OccurrenceMessageMenu
          attachmentUrls={attachmentUrls}
          canForward={canForward}
          from={from}
          message={message}
          occurrenceId={occurrenceId}
          portalAvailable={portalAvailable}
        />
      ) : null}
    </span>
  )
}

const INTERACTIVE = 'a, button, input, textarea, select, label, [role="menu"], [role="menuitem"]'

/**
 * Clique num balão marca a mensagem. Fica de fora o clique que é outra coisa: um link, um botão, ou o fim de
 * uma seleção de texto (quem arrastou para copiar um trecho não quis marcar a mensagem).
 */
export function selectBubbleOnClick(event: MouseEvent<HTMLElement>): void {
  const target = event.target as Element
  if (target.closest(INTERACTIVE) !== null) return
  const selection = window.getSelection()
  if (selection !== null && !selection.isCollapsed) return
  target
    .closest('.cv-p-bubble')
    ?.querySelector<HTMLButtonElement>('[data-message-select="true"]')
    ?.click()
}

/** O invólucro do fio que recebe o clique nos balões. */
export function SelectableThread({
  children,
  onClick,
}: Readonly<{ children: ReactNode; onClick: (event: MouseEvent<HTMLElement>) => void }>) {
  return (
    // O teclado marca pelo interruptor de cada balão; o clique aqui é o atalho do mouse.
    <div className={styles.selectableThread} onClick={onClick}>
      {children}
    </div>
  )
}
