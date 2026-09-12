/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FlowGraphData, FlowNodeData } from '@adatechnology/meta-whatsapp-contracts'

export type WhatsAppFlowGraphDiff = {
  readonly addedNodeIds: readonly string[]
  readonly changedNodeIds: readonly string[]
  readonly isEqual: boolean
  readonly labelChanged: boolean
  readonly removedNodeIds: readonly string[]
  readonly startNodeIdChanged: boolean
}

/**
 * Compara dois grafos por conteúdo — nunca por `version`, que é da linha viva do módulo e não do que
 * o código descreve. Usada pelo comando de republicação para mostrar o diff sem `--confirm` (RF8) e
 * para decidir se uma publicação é `unchanged` (não sobe versão) ou precisa gravar histórico.
 */
export function diffWhatsAppFlowGraphs(
  current: FlowGraphData | undefined,
  next: FlowGraphData,
): WhatsAppFlowGraphDiff {
  const currentNodeIds = new Set(Object.keys(current?.nodes ?? {}))
  const nextNodeIds = new Set(Object.keys(next.nodes))

  const addedNodeIds = [...nextNodeIds].filter((id) => !currentNodeIds.has(id)).toSorted()
  const removedNodeIds = [...currentNodeIds].filter((id) => !nextNodeIds.has(id)).toSorted()
  const changedNodeIds = [...nextNodeIds]
    .filter((id) => currentNodeIds.has(id))
    .filter((id) => !isSameNode(current?.nodes[id], next.nodes[id]))
    .toSorted()

  const labelChanged = current?.label !== next.label
  const startNodeIdChanged = current?.startNodeId !== next.startNodeId

  return {
    addedNodeIds,
    changedNodeIds,
    isEqual:
      addedNodeIds.length === 0 &&
      removedNodeIds.length === 0 &&
      changedNodeIds.length === 0 &&
      !labelChanged &&
      !startNodeIdChanged,
    labelChanged,
    removedNodeIds,
    startNodeIdChanged,
  }
}

/**
 * `JSON.stringify` cru compararia por ordem de chave, e o `jsonb` do Postgres não promete devolver
 * a mesma ordem em que o objeto foi inserido — o mesmo nó ida e volta pelo banco entraria em
 * `changedNodeIds` sem ter mudado nada. `canonicalStringify` ordena as chaves recursivamente antes
 * de comparar.
 */
function isSameNode(left: FlowNodeData | undefined, right: FlowNodeData | undefined): boolean {
  return canonicalStringify(left) === canonicalStringify(right)
}

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalStringify(entry)).join(',')}]`
  if (value === null || typeof value !== 'object') return JSON.stringify(value)

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .toSorted(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalStringify(entryValue)}`).join(',')}}`
}
