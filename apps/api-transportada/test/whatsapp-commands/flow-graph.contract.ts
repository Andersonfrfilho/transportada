/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T008 — o grafo raiz definitivo precisa passar a validação da T007 sem violação nenhuma,
 * ter ids sem acento (§7) e todo ramo terminando em saída explícita (§5).
 */
import { describe, expect, test } from 'bun:test'

import { validateFlowGraphForWhatsApp } from '../../src/whatsapp-commands/domain/whatsapp-menu.policy.js'
import { WHATSAPP_MENU_OPTION_ID_PATTERN } from '../../src/whatsapp-commands/domain/whatsapp-menu.constant.js'
import { WHATSAPP_ROOT_MENU_OPTION_PERMISSIONS } from '../../src/whatsapp-commands/domain/whatsapp-root-menu.policy.js'
import {
  WHATSAPP_ROOT_FLOW_GRAPH,
  WHATSAPP_ROOT_FLOW_GRAPH_KEY,
} from '../../src/whatsapp-commands/infrastructure/whatsapp-flow-graph.constant.js'

describe('WHATSAPP_ROOT_FLOW_GRAPH', () => {
  test('passa a validação de canal do WhatsApp sem nenhuma violação', () => {
    expect(validateFlowGraphForWhatsApp(WHATSAPP_ROOT_FLOW_GRAPH)).toEqual([])
  })

  test('a chave é estável e sem acento', () => {
    expect(WHATSAPP_ROOT_FLOW_GRAPH_KEY).toBe('transportada_root')
    expect(WHATSAPP_ROOT_FLOW_GRAPH.key).toBe(WHATSAPP_ROOT_FLOW_GRAPH_KEY)
    expect(WHATSAPP_MENU_OPTION_ID_PATTERN.test(WHATSAPP_ROOT_FLOW_GRAPH_KEY)).toBeTrue()
  })

  test('todo id de nó também segue o padrão sem acento do §7', () => {
    for (const nodeId of Object.keys(WHATSAPP_ROOT_FLOW_GRAPH.nodes)) {
      expect(WHATSAPP_MENU_OPTION_ID_PATTERN.test(nodeId)).toBeTrue()
    }
  })

  test('toda opção do menu raiz tem entrada na tabela de permissão de D2', () => {
    const rootNode = WHATSAPP_ROOT_FLOW_GRAPH.nodes[WHATSAPP_ROOT_FLOW_GRAPH.startNodeId]
    for (const [optionId] of rootNode?.options ?? []) {
      expect(WHATSAPP_ROOT_MENU_OPTION_PERMISSIONS[optionId]).toBeDefined()
    }
  })

  test('toda opção do menu raiz aponta para um nó existente do grafo', () => {
    const rootNode = WHATSAPP_ROOT_FLOW_GRAPH.nodes[WHATSAPP_ROOT_FLOW_GRAPH.startNodeId]
    const next = rootNode?.next
    if (next === undefined || typeof next === 'string') throw new Error('menu sem next.byAnswer')

    for (const [optionId] of rootNode?.options ?? []) {
      const target = next.byAnswer[optionId]
      expect(target).toBeDefined()
      expect(WHATSAPP_ROOT_FLOW_GRAPH.nodes[target ?? '']).toBeDefined()
    }
  })

  /**
   * Spec 144 T015/T016: "minha_viagem" e "viagens_armazem" deixaram de ser terminais — os ramos do
   * motorista e do operador estão implementados. Só a emissão fiscal (T012/T013) continua "Em
   * breve.".
   */
  test('todo ramo ainda sem ação termina num nó terminal explícito ("Em breve.")', () => {
    const rootNode = WHATSAPP_ROOT_FLOW_GRAPH.nodes[WHATSAPP_ROOT_FLOW_GRAPH.startNodeId]
    const next = rootNode?.next
    if (next === undefined || typeof next === 'string') throw new Error('menu sem next.byAnswer')

    for (const [optionId, targetId] of Object.entries(next.byAnswer)) {
      if (optionId === 'minha_viagem' || optionId === 'viagens_armazem') continue
      const target = WHATSAPP_ROOT_FLOW_GRAPH.nodes[targetId]
      expect(target?.type).toBe('action')
      expect(target?.directMessage).toContain('chegando')
    }
  })

  test('"minha_viagem" aponta para a FlowAction que consulta a viagem ativa (T015)', () => {
    const rootNode = WHATSAPP_ROOT_FLOW_GRAPH.nodes[WHATSAPP_ROOT_FLOW_GRAPH.startNodeId]
    const next = rootNode?.next
    if (next === undefined || typeof next === 'string') throw new Error('menu sem next.byAnswer')

    const target = WHATSAPP_ROOT_FLOW_GRAPH.nodes[next.byAnswer.minha_viagem ?? '']
    expect(target?.type).toBe('action')
    expect(target?.directMessage).toBeUndefined()
  })

  test('"viagens_armazem" aponta para a FlowAction que lista as viagens do barracão (T016)', () => {
    const rootNode = WHATSAPP_ROOT_FLOW_GRAPH.nodes[WHATSAPP_ROOT_FLOW_GRAPH.startNodeId]
    const next = rootNode?.next
    if (next === undefined || typeof next === 'string') throw new Error('menu sem next.byAnswer')

    const target = WHATSAPP_ROOT_FLOW_GRAPH.nodes[next.byAnswer.viagens_armazem ?? '']
    expect(target?.type).toBe('action')
    expect(target?.directMessage).toBeUndefined()
  })

  test('nenhum nó fica sem saída — action termina por si, os demais têm next', () => {
    for (const node of Object.values(WHATSAPP_ROOT_FLOW_GRAPH.nodes)) {
      if (node.type === 'action') continue
      expect(node.next).toBeDefined()
    }
  })
})
