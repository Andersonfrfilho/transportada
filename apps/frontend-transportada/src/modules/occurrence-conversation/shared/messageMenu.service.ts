/* Copyright (c) 2026 Ada Technology. MIT License. */
import { copyableMessageText } from './messageForward.service'

export type MessageMenuItem =
  | { readonly kind: 'copy-selection'; readonly text: string }
  | { readonly kind: 'copy-text'; readonly text: string }
  | { readonly kind: 'forward' }
  | { readonly attachmentId: string; readonly fileName: string; readonly kind: 'download' }

/**
 * As opções do menu da mensagem, na ordem em que aparecem. "Copiar seleção" só existe com um trecho
 * selecionado dentro do balão que não seja o texto inteiro (aí "Copiar texto" já basta); encaminhar só
 * quando há para onde e o que levar.
 */
export function buildMessageMenuItems(input: {
  readonly canForward: boolean
  readonly message: Readonly<{
    attachments: readonly Readonly<{ filename: string; id: string }>[]
    text: null | string
  }>
  readonly selectedText: string
}): readonly MessageMenuItem[] {
  const text = copyableMessageText(input.message)
  const selection = input.selectedText.trim()
  return [
    ...(selection === '' || selection === text
      ? []
      : [{ kind: 'copy-selection' as const, text: selection }]),
    ...(text === null ? [] : [{ kind: 'copy-text' as const, text }]),
    ...(input.canForward ? [{ kind: 'forward' as const }] : []),
    ...input.message.attachments.map((attachment) => ({
      attachmentId: attachment.id,
      fileName: attachment.filename,
      kind: 'download' as const,
    })),
  ]
}

/** O trecho que a pessoa selecionou, só quando começa e termina dentro do balão. */
export function selectedTextWithin(container: Element | null): string {
  const selection = typeof window === 'undefined' ? null : window.getSelection()
  if (container === null || selection === null || selection.isCollapsed) return ''
  const { anchorNode, focusNode } = selection
  if (anchorNode === null || focusNode === null) return ''
  if (!container.contains(anchorNode) || !container.contains(focusNode)) return ''
  return selection.toString()
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
