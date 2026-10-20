/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantMessageActionsTarget } from '@adatechnology/conversations-ui/participant'

import { planMessageForward, type MessageForwardStep } from './messageForward.service'

export type SelectableMessage = Readonly<
  Pick<ParticipantMessageActionsTarget, 'authorName' | 'id' | 'isMine' | 'text'> & {
    attachments: readonly Readonly<{ filename: string; id: string }>[]
  }
>

export type MessageSelection = ReadonlyMap<string, SelectableMessage>

type ConversationEntry = Readonly<{ createdAt: string; id: string }>

/** Marca a mensagem, ou desmarca se já estava marcada. Devolve um mapa novo: o estado do React compara por referência. */
export function toggleSelected(
  selection: MessageSelection,
  message: SelectableMessage,
): MessageSelection {
  const next = new Map(selection)
  if (next.has(message.id)) next.delete(message.id)
  else next.set(message.id, message)
  return next
}

/** As marcadas na ordem em que aparecem na conversa; a que saiu da conversa sai da seleção. */
export function selectedInConversationOrder(
  conversation: readonly ConversationEntry[],
  selection: MessageSelection,
): readonly (SelectableMessage & Readonly<{ createdAt: string }>)[] {
  return conversation.flatMap((entry) => {
    const message = selection.get(entry.id)
    return message === undefined ? [] : [{ ...message, createdAt: entry.createdAt }]
  })
}

/** Uma linha por mensagem: `[hora] autor: texto [arquivos]`. */
export function formatSelectionForCopy(input: {
  readonly conversation: readonly ConversationEntry[]
  readonly formatTime: (iso: string) => string
  readonly selected: MessageSelection
}): string {
  return selectedInConversationOrder(input.conversation, input.selected)
    .map((message) => {
      const author = message.authorName === null ? '' : ` ${message.authorName}:`
      const text = message.text?.trim() ?? ''
      const files = message.attachments.map((attachment) => `[${attachment.filename}]`)
      return [`[${input.formatTime(message.createdAt)}]${author}`, text, ...files]
        .filter((part) => part !== '')
        .join(' ')
    })
    .join('\n')
}

/** Os passos do encaminhar de cada mensagem marcada, em sequência; mensagem sem caminho não soma nada. */
export function planSelectionForward(input: {
  readonly conversation: readonly ConversationEntry[]
  readonly from: 'contractor' | 'driver'
  readonly portalAvailable?: boolean
  readonly selected: MessageSelection
}): readonly MessageForwardStep[] {
  return selectedInConversationOrder(input.conversation, input.selected).flatMap((message) =>
    planMessageForward({
      from: input.from,
      message,
      ...(input.portalAvailable === undefined ? {} : { portalAvailable: input.portalAvailable }),
    }),
  )
}
