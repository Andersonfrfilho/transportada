/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FlowGraphData, FlowNodeData } from '@adatechnology/meta-whatsapp-contracts'

import {
  BOT_SPEECH_DEFAULTS,
  BOT_SPEECH_NODE_PREFIX,
  botSpeechNodeId,
  type BotSpeechKey,
  type BotSpeechParams,
} from './whatsapp-bot-speech.constant.js'

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g

/** Troca `{{nome}}` pelo valor; variável que a ação não passou fica como está, nunca some em silêncio. */
export function interpolateBotSpeech(template: string, params: BotSpeechParams = {}): string {
  return template.replaceAll(PLACEHOLDER, (placeholder, name: string) => {
    const value = params[name]
    return value === undefined ? placeholder : String(value)
  })
}

/** Os nós de fala que o grafo raiz publica: ação terminal solta, só com a `directMessage`. */
export function buildBotSpeechNodes(): Record<string, FlowNodeData> {
  const nodes: Record<string, FlowNodeData> = {}
  for (const key of Object.keys(BOT_SPEECH_DEFAULTS) as BotSpeechKey[]) {
    const id = botSpeechNodeId(key)
    nodes[id] = {
      directMessage: BOT_SPEECH_DEFAULTS[key],
      id,
      label: `Fala do bot: ${key}`,
      type: 'action',
    }
  }
  return nodes
}

/** O texto vivo da fala no grafo publicado; vazio ou ausente cai no padrão do código. */
export function resolveBotSpeechTemplate(
  graph: FlowGraphData | undefined,
  key: BotSpeechKey,
): string {
  const published = graph?.nodes[botSpeechNodeId(key)]?.directMessage
  return published !== undefined && published.trim() !== '' ? published : BOT_SPEECH_DEFAULTS[key]
}

/**
 * Republicar pelo código não pode desfazer o que o editor mudou: nó de fala que já existe no grafo
 * vivo mantém a `directMessage` de lá; só fala nova entra com o padrão do código.
 */
export function preserveEditedBotSpeech(
  current: FlowGraphData | undefined,
  next: FlowGraphData,
): FlowGraphData {
  if (current === undefined) return next
  const nodes = { ...next.nodes }
  for (const [id, node] of Object.entries(next.nodes)) {
    if (!id.startsWith(BOT_SPEECH_NODE_PREFIX)) continue
    const live = current.nodes[id]
    if (live?.directMessage === undefined || live.directMessage.trim() === '') continue
    nodes[id] = { ...node, directMessage: live.directMessage }
  }
  return { ...next, nodes }
}
