/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { Icon } from '@/components/ui/icon'

import { useForwardMessageMutation } from '../queries/occurrenceConversation.query'
import { isForwardAlreadyDone } from '../shared/conversationAttachment.service'
import { formatSelectionForCopy, planSelectionForward } from '../shared/messageSelection.service'
import type { MessageSelectionState } from '../shared/useMessageSelection.hook'
import styles from '../styles/occurrenceThread.module.css'

type OccurrenceSelectionBarProps = Readonly<{
  canForward: boolean
  conversation: readonly Readonly<{ createdAt: string; id: string }>[]
  from: 'contractor' | 'driver'
  occurrenceId: string
  portalAvailable?: boolean
  selection: MessageSelectionState
}>

/**
 * A barra do modo de seleção: quantas estão marcadas, copiar todas, encaminhar todas ao outro chat e sair. O texto
 * copiado e os envios seguem a ordem da conversa, não a ordem da marcação.
 */
export function OccurrenceSelectionBar({
  canForward,
  conversation,
  from,
  occurrenceId,
  portalAvailable = false,
  selection,
}: OccurrenceSelectionBarProps) {
  const { i18n, t } = useTranslation('occurrenceConversation')
  const forward = useForwardMessageMutation(occurrenceId)
  const count = selection.selected.size
  const timeFormat = new Intl.DateTimeFormat(i18n.language, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  })
  const copyText = formatSelectionForCopy({
    conversation,
    formatTime: (iso) => timeFormat.format(new Date(iso)),
    selected: selection.selected,
  })
  const steps = canForward
    ? planSelectionForward({ conversation, from, portalAvailable, selected: selection.selected })
    : []
  const forwardLabel =
    from === 'contractor' ? t('selection.forwardToDriver') : t('selection.forwardToContractor')
  const failed = forward.isError && !isForwardAlreadyDone(forward.error)

  return (
    <div aria-label={t('selection.title')} className={styles.selectionBar} role="toolbar">
      <span aria-live="polite" className={styles.selectionCount}>
        {t('selection.count', { count })}
      </span>
      {copyText === '' ? null : (
        <CopyButton
          copiedLabel={t('message.copied')}
          label={t('selection.copy')}
          value={copyText}
        />
      )}
      {canForward ? (
        <Button
          disabled={steps.length === 0 || forward.isPending}
          onClick={() => forward.mutate(steps, { onSuccess: selection.clear })}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Icon name="send" size="sm" />
          {forward.isPending ? t('selection.forwarding') : forwardLabel}
        </Button>
      ) : null}
      <Button onClick={selection.clear} size="sm" type="button" variant="ghost">
        {t('selection.cancel')}
      </Button>
      {failed ? (
        <span className={styles.error} role="alert">
          {t('message.forwardError')}
        </span>
      ) : null}
    </div>
  )
}
