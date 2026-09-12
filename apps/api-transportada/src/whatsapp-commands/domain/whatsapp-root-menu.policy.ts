/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FlowGraphData } from '@adatechnology/meta-whatsapp-contracts'

/**
 * D2: "o menu raiz é filtrado por permissão". Cada opção do nó raiz declara com quais permissões da
 * membership ela é oferecida — qualquer uma da lista basta. Opção que não aparece aqui é sempre
 * oferecida (ex.: uma futura "❓ Ajuda"), porque a tabela existe para **restringir**, não para
 * autorizar por omissão.
 *
 * ⚠️ Isto é só a vitrine. A `FlowAction` de cada ramo confere a permissão de novo, com o ator
 * resolvido pelo telefone da sessão (`with-authorized-actor.service.ts`) — menu escondido não é
 * autorização (security.md §8).
 */
export const WHATSAPP_ROOT_MENU_OPTION_PERMISSIONS: Readonly<Record<string, readonly string[]>> = {
  emitir_documentos: ['cte.submit', 'nfse.issue'],
  minha_viagem: ['trip.report'],
  viagens_armazem: ['trip.manage'],
}

/**
 * Filtra as opções de um nó de menu pela permissão do ator. Função pura: recebe as opções do grafo
 * (todas publicadas) e o conjunto de permissões da membership, devolve só as que ela alcança.
 */
export function filterMenuOptionsByPermission(
  options: readonly [string, string][],
  permissions: ReadonlySet<string>,
): [string, string][] {
  return options.filter(([optionId]) => {
    const required = WHATSAPP_ROOT_MENU_OPTION_PERMISSIONS[optionId]
    if (required === undefined) return true
    return required.some((permission) => permissions.has(permission))
  })
}

/**
 * Aplica o filtro só ao nó raiz do grafo (`graph.startNodeId`) — os demais nós do grafo raiz (ex.
 * um terminal "Em breve.") não são vitrine de permissão, e filtrá-los seria inventar uma regra que
 * D2 não pede. Grafo sem nó raiz de escolha, ou sem opções, volta inalterado.
 */
export function filterWhatsAppRootFlowGraph(
  graph: FlowGraphData,
  permissions: ReadonlySet<string>,
): FlowGraphData {
  const rootNode = graph.nodes[graph.startNodeId]
  if (rootNode?.options === undefined) return graph

  return {
    ...graph,
    nodes: {
      ...graph.nodes,
      [graph.startNodeId]: {
        ...rootNode,
        options: filterMenuOptionsByPermission(rootNode.options, permissions),
      },
    },
  }
}
