/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantMessageMenuOptions } from '@adatechnology/conversations-ui/participant'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useForwardMessageMutation } from '../queries/occurrenceConversation.query'
import { isForwardAlreadyDone } from './conversationAttachment.service'
import type { MessageForwardStep } from './messageForward.service'
import { buildOccurrenceMenuItems, planSelectionForward } from './occurrenceMessageMenu.service'

/**
 * As opções do painel no menu de mensagem do SDK: encaminhar ao outro chat (uma ou várias marcadas) e baixar os
 * arquivos. Devolve também se o último encaminhamento falhou, para o painel avisar.
 */
export function useOccurrenceMessageMenu(input: {
  readonly attachmentUrls: ReadonlyMap<string, string>
  readonly canForward: boolean
  readonly from: 'contractor' | 'driver'
  readonly occurrenceId: string
  readonly portalAvailable?: boolean
}): Readonly<{ forwardFailed: boolean; options: ParticipantMessageMenuOptions }> {
  const { t } = useTranslation('occurrenceConversation')
  const forward = useForwardMessageMutation(input.occurrenceId)
  const [forwardedIds, setForwardedIds] = useState<ReadonlySet<string>>(new Set())
  const forwardLabel =
    input.from === 'contractor' ? t('message.forwardToDriver') : t('message.forwardToContractor')

  function run(ids: readonly string[], steps: readonly MessageForwardStep[]): void {
    forward.mutate(steps, {
      onSettled: (_data, error) => {
        if (error === null || isForwardAlreadyDone(error)) {
          setForwardedIds((current) => new Set([...current, ...ids]))
        }
      },
    })
  }

  return {
    forwardFailed: forward.isError && !isForwardAlreadyDone(forward.error),
    options: {
      items: (message) =>
        buildOccurrenceMenuItems({
          attachmentUrls: input.attachmentUrls,
          canForward: input.canForward,
          from: input.from,
          isForwarded: forwardedIds.has(message.id),
          isPending: forward.isPending,
          labels: {
            download: (name) => t('message.download', { name }),
            forward: forwardLabel,
            forwarded: t('message.forwarded'),
          },
          message,
          onForward: (steps) => run([message.id], steps),
          portalAvailable: input.portalAvailable === true,
        }),
      selectionActions: (messages) => {
        const steps = input.canForward
          ? planSelectionForward({
              from: input.from,
              messages,
              portalAvailable: input.portalAvailable === true,
            })
          : []
        return steps.length === 0
          ? []
          : [
              {
                disabled: forward.isPending,
                id: 'forward',
                label: forwardLabel,
                onSelect: (selected) =>
                  run(
                    selected.map((message) => message.id),
                    steps,
                  ),
              },
            ]
      },
    },
  }
}
