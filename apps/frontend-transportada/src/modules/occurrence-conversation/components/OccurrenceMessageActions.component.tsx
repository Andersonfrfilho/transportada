/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantMessageActionsTarget } from '@adatechnology/conversations-ui/participant'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { Icon } from '@/components/ui/icon'
import { Tooltip } from '@/components/ui/tooltip'

import { useForwardMessageMutation } from '../queries/occurrenceConversation.query'
import { isForwardAlreadyDone } from '../shared/conversationAttachment.service'
import { copyableMessageText, planMessageForward } from '../shared/messageForward.service'
import styles from '../styles/occurrenceThread.module.css'

type OccurrenceMessageActionsProps = Readonly<{
  /** Sem o outro chat disponível (sem permissão, sem portal, sem motorista), só copiar. */
  canForward: boolean
  from: 'contractor' | 'driver'
  message: ParticipantMessageActionsTarget
  occurrenceId: string
  /** Do motorista à contratante, só o portal leva arquivo. */
  portalAvailable?: boolean
}>

/**
 * As ações de cada balão dos chats da ocorrência: copiar o texto e encaminhar ao outro chat. Ícones com dica,
 * para o balão não crescer; o nome da ação fica no `aria-label`.
 */
export function OccurrenceMessageActions({
  canForward,
  from,
  message,
  occurrenceId,
  portalAvailable = false,
}: OccurrenceMessageActionsProps) {
  const { t } = useTranslation('occurrenceConversation')
  const forward = useForwardMessageMutation(occurrenceId)
  const text = copyableMessageText(message)
  const steps = canForward ? planMessageForward({ from, message, portalAvailable }) : []
  if (text === null && steps.length === 0) return null

  const forwardLabel =
    from === 'contractor' ? t('message.forwardToDriver') : t('message.forwardToContractor')
  const isForwarded = forward.isSuccess || isForwardAlreadyDone(forward.error)

  return (
    <span className={styles.messageActions}>
      {text === null ? null : (
        <CopyButton copiedLabel={t('message.copied')} label={t('message.copy')} value={text} />
      )}
      {steps.length === 0 ? null : (
        <Tooltip label={isForwarded ? t('message.forwarded') : forwardLabel}>
          <Button
            aria-label={forwardLabel}
            disabled={forward.isPending || isForwarded}
            onClick={() => forward.mutate(steps)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name={isForwarded ? 'check' : 'send'} size="sm" />
          </Button>
        </Tooltip>
      )}
      {forward.isError && !isForwarded ? (
        <span className={styles.error} role="alert">
          {t('message.forwardError')}
        </span>
      ) : null}
    </span>
  )
}
