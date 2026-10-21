/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantMessageActionsTarget } from '@adatechnology/conversations-ui/participant'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Tooltip } from '@/components/ui/tooltip'
import { useFloatingLayer } from '@/components/ui/useFloatingLayer.hook'
import { COPY_FEEDBACK_MILLISECONDS } from '@/modules/shared/clipboard.constant'

import { useForwardMessageMutation } from '../queries/occurrenceConversation.query'
import { isForwardAlreadyDone } from '../shared/conversationAttachment.service'
import { planMessageForward } from '../shared/messageForward.service'
import {
  buildMessageMenuItems,
  selectedTextWithin,
  type MessageMenuItem,
} from '../shared/messageMenu.service'
import styles from '../styles/occurrenceThread.module.css'

type OccurrenceMessageMenuProps = Readonly<{
  /** Endereço de download de cada anexo, por id; anexo sem endereço não ganha "Baixar". */
  attachmentUrls: ReadonlyMap<string, string>
  /** Sem o outro chat disponível (sem permissão, sem portal, sem motorista), não há "Encaminhar". */
  canForward: boolean
  from: 'contractor' | 'driver'
  message: ParticipantMessageActionsTarget
  occurrenceId: string
  /** Do motorista à contratante, só o portal leva arquivo. */
  portalAvailable?: boolean
}>

/** O balão do SDK: a seleção só vira "Copiar seleção" quando começa e termina dentro dele. */
const BUBBLE_SELECTOR = '.cv-p-bubble'

/**
 * As opções de cada balão dos chats da ocorrência, atrás de um botão de três pontos: copiar o trecho
 * selecionado, copiar o texto, encaminhar ao outro chat e baixar os arquivos. Ficam fora da vista para o
 * balão não crescer com ícones que quase nunca são usados.
 *
 * ⚠️ A seleção é lida no `pointerdown`/`keydown` do botão, antes de o clique mexer no foco: lida no
 * `click`, alguns navegadores já a teriam desfeito.
 */
export function OccurrenceMessageMenu({
  attachmentUrls,
  canForward,
  from,
  message,
  occurrenceId,
  portalAvailable = false,
}: OccurrenceMessageMenuProps) {
  const { t } = useTranslation('occurrenceConversation')
  const forward = useForwardMessageMutation(occurrenceId)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedText, setSelectedText] = useState('')
  const [hasCopied, setHasCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuId = useId()
  const { anchorRef, layerRef, layerStyle } = useFloatingLayer<HTMLDivElement>({
    align: 'end',
    isOpen,
    onDismiss: () => setIsOpen(false),
  })

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    },
    [],
  )

  /** Ao abrir, o foco vai à primeira opção: quem chegou por teclado segue nas setas. */
  useEffect(() => {
    if (!isOpen) return
    layerRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus()
  }, [isOpen, layerRef])

  const steps = canForward ? planMessageForward({ from, message, portalAvailable }) : []
  const items = buildMessageMenuItems({
    canForward: steps.length > 0,
    message: {
      attachments: message.attachments.filter((attachment) => attachmentUrls.has(attachment.id)),
      text: message.text,
    },
    selectedText,
  })
  if (items.length === 0) return null

  const isForwarded = forward.isSuccess || isForwardAlreadyDone(forward.error)
  const triggerLabel = hasCopied ? t('message.copied') : t('message.options')

  function captureSelection(): void {
    if (isOpen) return
    setSelectedText(selectedTextWithin(anchorRef.current?.closest(BUBBLE_SELECTOR) ?? null))
  }

  function close(): void {
    setIsOpen(false)
    anchorRef.current?.querySelector('button')?.focus()
  }

  async function copy(text: string): Promise<void> {
    close()
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /** Área de transferência negada é recusa do navegador, não erro do produto: o ✓ não sai. */
      return
    }
    setHasCopied(true)
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setHasCopied(false), COPY_FEEDBACK_MILLISECONDS)
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key === 'Tab') {
      setIsOpen(false)
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'End', 'Home'].includes(event.key)) return
    event.preventDefault()
    const options = [
      ...(layerRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ??
        []),
    ]
    if (options.length === 0) return
    const current = options.indexOf(document.activeElement as HTMLElement)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
    options[next]?.focus()
  }

  function renderItem(item: MessageMenuItem) {
    switch (item.kind) {
      case 'copy-selection':
      case 'copy-text':
        return (
          <button
            className={styles.messageMenuItem}
            key={item.kind}
            onClick={() => void copy(item.text)}
            role="menuitem"
            type="button"
          >
            <Icon name="copy" size="sm" />
            {item.kind === 'copy-selection' ? t('message.copySelection') : t('message.copy')}
          </button>
        )
      case 'forward':
        return (
          <button
            className={styles.messageMenuItem}
            disabled={forward.isPending || isForwarded}
            key={item.kind}
            onClick={() => {
              forward.mutate(steps)
              close()
            }}
            role="menuitem"
            type="button"
          >
            <Icon name={isForwarded ? 'check' : 'send'} size="sm" />
            {isForwarded
              ? t('message.forwarded')
              : from === 'contractor'
                ? t('message.forwardToDriver')
                : t('message.forwardToContractor')}
          </button>
        )
      case 'download':
        return (
          <a
            className={styles.messageMenuItem}
            download={item.fileName}
            href={attachmentUrls.get(item.attachmentId)}
            key={item.attachmentId}
            onClick={() => setIsOpen(false)}
            rel="noopener noreferrer"
            role="menuitem"
            target="_blank"
          >
            <Icon name="download" size="sm" />
            <span className={styles.messageMenuItemText}>
              {t('message.download', { name: item.fileName })}
            </span>
          </a>
        )
    }
  }

  return (
    <span className={styles.messageMenu}>
      <div
        className={styles.messageMenuAnchor}
        data-open={isOpen ? 'true' : 'false'}
        ref={anchorRef}
      >
        <Tooltip dismissOnActivate label={triggerLabel}>
          <Button
            aria-controls={isOpen ? menuId : undefined}
            aria-expanded={isOpen}
            aria-haspopup="menu"
            aria-label={triggerLabel}
            onClick={() => setIsOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') captureSelection()
            }}
            onPointerDown={captureSelection}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name={hasCopied ? 'check' : 'more-vertical'} size="sm" />
          </Button>
        </Tooltip>
      </div>
      {forward.isError && !isForwarded ? (
        <span className={styles.error} role="alert">
          {t('message.forwardError')}
        </span>
      ) : null}
      {isOpen
        ? createPortal(
            <div
              aria-label={t('message.options')}
              className={styles.messageMenuPanel}
              id={menuId}
              onKeyDown={onMenuKeyDown}
              ref={layerRef}
              role="menu"
              style={layerStyle}
            >
              {items.map(renderItem)}
            </div>,
            document.body,
          )
        : null}
    </span>
  )
}
