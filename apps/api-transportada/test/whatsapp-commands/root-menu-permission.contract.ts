/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T008 — D2: o menu raiz é filtrado por permissão. Testa a tabela e o filtro puro; a
 * fiação no despachante (findFlowGraph/locateNode/findRootGraph) é coberta em
 * `command-driver.contract.ts` porque ela precisa do ator resolvido de verdade.
 */
import { describe, expect, test } from 'bun:test'
import type { FlowGraphData } from '@adatechnology/meta-whatsapp-contracts'

import {
  filterMenuOptionsByPermission,
  filterWhatsAppRootFlowGraph,
  WHATSAPP_ROOT_MENU_OPTION_PERMISSIONS,
} from '../../src/whatsapp-commands/domain/whatsapp-root-menu.policy.js'

const OPTIONS: [string, string][] = [
  ['emitir_documentos', '📄 Emitir documentos'],
  ['minha_viagem', '🚚 Minha viagem'],
  ['viagens_armazem', '🏭 Viagens do armazém'],
]

describe('filterMenuOptionsByPermission', () => {
  test('oferece só a opção cuja permissão a membership tem', () => {
    const filtered = filterMenuOptionsByPermission(OPTIONS, new Set(['trip.manage']))
    expect(filtered.map(([id]) => id)).toEqual(['viagens_armazem'])
  })

  test('qualquer uma das permissões listadas basta (cte.submit ou nfse.issue)', () => {
    const bySubmit = filterMenuOptionsByPermission(OPTIONS, new Set(['cte.submit']))
    const byIssue = filterMenuOptionsByPermission(OPTIONS, new Set(['nfse.issue']))
    expect(bySubmit.map(([id]) => id)).toEqual(['emitir_documentos'])
    expect(byIssue.map(([id]) => id)).toEqual(['emitir_documentos'])
  })

  test('sem permissão nenhuma, o menu fica vazio — nenhuma opção sai por omissão', () => {
    expect(filterMenuOptionsByPermission(OPTIONS, new Set())).toEqual([])
  })

  test('opção sem entrada na tabela é sempre oferecida', () => {
    const withExtra: [string, string][] = [...OPTIONS, ['ajuda', '❓ Ajuda']]
    const filtered = filterMenuOptionsByPermission(withExtra, new Set())
    expect(filtered.map(([id]) => id)).toEqual(['ajuda'])
  })

  test('membership com as três permissões vê as três opções, na ordem publicada', () => {
    const filtered = filterMenuOptionsByPermission(
      OPTIONS,
      new Set(['cte.submit', 'trip.report', 'trip.manage']),
    )
    expect(filtered).toEqual(OPTIONS)
  })

  test('a tabela declara exatamente as três opções de D2', () => {
    expect(WHATSAPP_ROOT_MENU_OPTION_PERMISSIONS).toEqual({
      emitir_documentos: ['cte.submit', 'nfse.issue'],
      minha_viagem: ['trip.report'],
      viagens_armazem: ['trip.manage'],
    })
  })
})

describe('filterWhatsAppRootFlowGraph', () => {
  const graph: FlowGraphData = {
    key: 'root',
    label: 'Menu',
    nodes: {
      menu: {
        fallbackMessage: 'Escolha.',
        id: 'menu',
        next: { byAnswer: {}, default: 'menu' },
        options: OPTIONS,
        question: 'O que você quer fazer?',
        type: 'menu',
      },
      terminal: { directMessage: 'fim', id: 'terminal', type: 'action' },
    },
    startNodeId: 'menu',
    version: 3,
  }

  test('filtra só as opções do nó raiz, sem tocar em nada mais do grafo', () => {
    const filtered = filterWhatsAppRootFlowGraph(graph, new Set(['trip.manage']))
    expect(filtered.nodes.menu?.options?.map(([id]) => id)).toEqual(['viagens_armazem'])
    expect(filtered.nodes.terminal).toEqual(graph.nodes.terminal)
    expect(filtered.key).toBe(graph.key)
    expect(filtered.version).toBe(graph.version)
    // A entrada original não é mutada — quem chama de novo com outra permissão vê o grafo completo.
    expect(graph.nodes.menu?.options).toEqual(OPTIONS)
  })

  test('nó raiz sem opções (ex.: grafo de teste com startNodeId de ação) volta inalterado', () => {
    const actionRooted: FlowGraphData = {
      ...graph,
      nodes: { ...graph.nodes, menu: { directMessage: 'oi', id: 'menu', type: 'action' } },
    }
    expect(filterWhatsAppRootFlowGraph(actionRooted, new Set())).toEqual(actionRooted)
  })
})
