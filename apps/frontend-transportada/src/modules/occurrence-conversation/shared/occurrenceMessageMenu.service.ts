/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantMessageMenuItem } from '@adatechnology/conversations-ui/participant'

import { planMessageForward, type MessageForwardStep } from './messageForward.service'

type MenuMessage = Readonly<{
  attachments: readonly Readonly<{ filename: string; id: string }>[]
  id: string
  text: null | string
}>

/**
 * O que o painel acrescenta ao menu de cada mensagem, depois de Copiar e Selecionar (que são do SDK): encaminhar ao
 * outro chat, quando há para onde e o que levar, e baixar cada arquivo que já tem endereço.
 */
export function buildOccurrenceMenuItems(input: {
  readonly attachmentUrls: ReadonlyMap<string, string>
  readonly canForward: boolean
  readonly from: 'contractor' | 'driver'
  readonly isForwarded: boolean
  readonly isPending: boolean
  readonly labels: Readonly<{
    download: (name: string) => string
    forward: string
    forwarded: string
  }>
  readonly message: MenuMessage
  readonly onForward: (steps: readonly MessageForwardStep[]) => void
  readonly portalAvailable?: boolean
}): readonly ParticipantMessageMenuItem[] {
  const steps = input.canForward
    ? planMessageForward({
        from: input.from,
        message: input.message,
        portalAvailable: input.portalAvailable === true,
      })
    : []
  const forward: ParticipantMessageMenuItem[] =
    steps.length === 0
      ? []
      : [
          {
            disabled: input.isForwarded || input.isPending,
            id: 'forward',
            label: input.isForwarded ? input.labels.forwarded : input.labels.forward,
            onSelect: () => input.onForward(steps),
          },
        ]
  const downloads = input.message.attachments.flatMap((attachment) => {
    const href = input.attachmentUrls.get(attachment.id)
    return href === undefined
      ? []
      : [
          {
            download: attachment.filename,
            href,
            id: `download:${attachment.id}`,
            label: input.labels.download(attachment.filename),
          },
        ]
  })
  return [...forward, ...downloads]
}

/** Os passos de encaminhar cada mensagem marcada, em sequência; o SDK entrega na ordem da conversa. */
export function planSelectionForward(input: {
  readonly from: 'contractor' | 'driver'
  readonly messages: readonly MenuMessage[]
  readonly portalAvailable?: boolean
}): readonly MessageForwardStep[] {
  return input.messages.flatMap((message) =>
    planMessageForward({
      from: input.from,
      message,
      portalAvailable: input.portalAvailable === true,
    }),
  )
}

/** Endereço de download de cada anexo, pelo id que o balão do SDK carrega. */
export function attachmentDownloadUrls(
  messages: readonly Readonly<{ attachments: readonly Readonly<{ id: string; url: string }>[] }>[],
): ReadonlyMap<string, string> {
  return new Map(
    messages.flatMap((message) =>
      message.attachments.map((attachment) => [attachment.id, attachment.url] as const),
    ),
  )
}
