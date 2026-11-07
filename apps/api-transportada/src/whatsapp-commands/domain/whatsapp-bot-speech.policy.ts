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
 * Republicar pelo código não pode desfazer o que o editor mudou: o nó de fala só é regravado quando
 * o texto vivo é igual ao da última publicação do código (`baseline`) — ou seja, ninguém o editou.
 * Sem baseline do nó não há como provar isso, então o texto vivo fica. Nó novo ou vazio recebe o padrão.
 */
export function preserveEditedBotSpeech(
  current: FlowGraphData | undefined,
  next: FlowGraphData,
  baseline: FlowGraphData | undefined,
  overwriteNodeIds: readonly string[] = [],
): FlowGraphData {
  if (current === undefined) return next
  const nodes = { ...next.nodes }
  for (const [id, node] of Object.entries(next.nodes)) {
    if (!id.startsWith(BOT_SPEECH_NODE_PREFIX)) continue
    if (overwriteNodeIds.includes(id)) continue
    const live = current.nodes[id]?.directMessage
    if (live === undefined || live.trim() === '') continue
    if (live === baseline?.nodes[id]?.directMessage) continue
    nodes[id] = { ...node, directMessage: live }
  }
  return { ...next, nodes }
}

/**
 * O que o código publicou DE FATO em cada nó: o nó regravado leva o texto novo; o `fala_*` preservado mantém a
 * entrada do baseline anterior (ou fica sem entrada), para o padrão novo nunca passar por "editado".
 */
export function buildCodeBaseline(input: {
  readonly codeGraph: FlowGraphData
  readonly previousBaseline: FlowGraphData | undefined
  readonly published: FlowGraphData
}): FlowGraphData {
  const nodes = { ...input.codeGraph.nodes }
  for (const id of Object.keys(input.codeGraph.nodes)) {
    if (!id.startsWith(BOT_SPEECH_NODE_PREFIX)) continue
    const wasWritten =
      input.published.nodes[id]?.directMessage === input.codeGraph.nodes[id]?.directMessage
    if (wasWritten) continue
    const previous = input.previousBaseline?.nodes[id]
    if (previous === undefined) delete nodes[id]
    else nodes[id] = previous
  }
  return { ...input.codeGraph, nodes }
}

/** Quantos `fala_*` a publicação mudaria no grafo vivo. */
export function countRewrittenBotSpeech(
  current: FlowGraphData | undefined,
  published: FlowGraphData,
): number {
  return Object.entries(published.nodes).filter(
    ([id, node]) =>
      id.startsWith(BOT_SPEECH_NODE_PREFIX) &&
      current?.nodes[id]?.directMessage !== node.directMessage,
  ).length
}

/** Só nó de fala pode ser sobrescrito pelo código; qualquer outra chave apagaria edição de fluxo alheio. */
export function assertOverwriteNodeIds(overwriteNodeIds: readonly string[]): void {
  const invalid = overwriteNodeIds.filter((id) => !id.startsWith(BOT_SPEECH_NODE_PREFIX))
  if (invalid.length > 0) {
    throw new Error(
      `--overwrite-nodes aceita só chaves ${BOT_SPEECH_NODE_PREFIX}*: ${invalid.join(', ')}`,
    )
  }
}
