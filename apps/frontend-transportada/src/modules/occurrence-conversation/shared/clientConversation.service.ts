/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  OccurrenceClientChannel,
  OccurrenceClientChannelStatus,
  OccurrenceConversation,
} from './occurrenceConversation.types'
import type { ConversationLayoutMode } from './occurrenceConversationLayout.service'

/**
 * Spec 283 D7: onde a conversa do cliente aparece. Só existe quando houve envio (D3); o desenho depende da largura e
 * do modo escolhido. Lado a lado em tela larga (≥ 80 rem) é a terceira coluna; entre 64 e 80 rem as duas colunas
 * ficam e o cliente vira uma faixa recolhida abaixo; em abas (ou no celular) é a aba "Cliente".
 */
export type ClientPlacement = 'column' | 'none' | 'strip' | 'tab'

export function resolveClientPlacement(input: {
  hasClientConversation: boolean
  isWide: boolean
  layout: ConversationLayoutMode
}): ClientPlacement {
  if (!input.hasClientConversation) return 'none'
  if (input.layout === 'tabs') return 'tab'
  return input.isWide ? 'column' : 'strip'
}

export function findClientConversation(
  conversations: readonly OccurrenceConversation[] | undefined,
): OccurrenceConversation | undefined {
  return conversations?.find((conversation) => conversation.participant === 'client')
}

/** Estado que o operador deve ver primeiro: falha vence; depois o que o cliente já fez, do mais para o menos avançado. */
const STATUS_TONE: Record<OccurrenceClientChannelStatus, 'bad' | 'ok' | 'wait'> = {
  delivered: 'ok',
  failed: 'bad',
  queued: 'wait',
  read: 'ok',
  replied: 'ok',
  sent: 'wait',
}

export function clientChannelTone(status: OccurrenceClientChannelStatus): 'bad' | 'ok' | 'wait' {
  return STATUS_TONE[status]
}

/** A chave de um chip é o canal + destino: o mesmo número não aparece duas vezes. */
export function clientChannelKey(channel: OccurrenceClientChannel): string {
  return `${channel.kind}:${channel.maskedAddress}`
}

export type ConversationColumnId = 'client' | 'contractor' | 'driver'

/**
 * Spec 283 RF6: a grade das colunas generalizada de duas para três. Devolve quantas colunas há e qual (1ª, 2ª ou 3ª)
 * está minimizada. Uma conversa minimizada fica só com o cabeçalho e as outras dividem o resto; com todas
 * minimizadas, ou mais de uma, a grade volta a dividir igual — nunca some conversa.
 */
export function resolveColumnsGrid(
  visible: readonly ConversationColumnId[],
  collapsed: Readonly<Record<ConversationColumnId, boolean>>,
): { collapsedIndex: 1 | 2 | 3 | null; count: number } {
  const collapsedIds = visible.filter((id) => collapsed[id])
  const only = collapsedIds.length === 1 && visible.length > 1 ? collapsedIds[0] : undefined
  const index = only === undefined ? -1 : visible.indexOf(only)
  return {
    collapsedIndex: index === 0 ? 1 : index === 1 ? 2 : index === 2 ? 3 : null,
    count: visible.length,
  }
}
