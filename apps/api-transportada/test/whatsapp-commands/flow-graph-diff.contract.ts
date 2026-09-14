/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import type { FlowGraphData } from '@adatechnology/meta-whatsapp-contracts'

import { diffWhatsAppFlowGraphs } from '../../src/whatsapp-commands/domain/whatsapp-flow-graph-diff.policy.js'

const BASE: FlowGraphData = {
  key: 'root',
  label: 'Menu',
  nodes: {
    about: { directMessage: 'sobre', id: 'about', type: 'action' },
    menu: {
      fallbackMessage: 'Escolha.',
      id: 'menu',
      next: { byAnswer: { about: 'about' }, default: 'menu' },
      options: [['about', 'ℹ️ Sobre']],
      question: 'O que você quer?',
      type: 'menu',
    },
  },
  startNodeId: 'menu',
  version: 4,
}

describe('diffWhatsAppFlowGraphs', () => {
  test('sem grafo publicado, tudo é adição', () => {
    const diff = diffWhatsAppFlowGraphs(undefined, BASE)
    expect(diff.isEqual).toBeFalse()
    expect(diff.addedNodeIds).toEqual(['about', 'menu'])
    expect(diff.removedNodeIds).toEqual([])
    expect(diff.changedNodeIds).toEqual([])
  })

  test('grafo idêntico é igual, mesmo com `version` diferente — version é da linha viva', () => {
    const diff = diffWhatsAppFlowGraphs(BASE, { ...BASE, version: 99 })
    expect(diff).toEqual({
      addedNodeIds: [],
      changedNodeIds: [],
      isEqual: true,
      labelChanged: false,
      removedNodeIds: [],
      startNodeIdChanged: false,
    })
  })

  test('nó novo entra em addedNodeIds', () => {
    const next: FlowGraphData = {
      ...BASE,
      nodes: { ...BASE.nodes, help: { directMessage: 'ajuda', id: 'help', type: 'action' } },
    }
    const diff = diffWhatsAppFlowGraphs(BASE, next)
    expect(diff.addedNodeIds).toEqual(['help'])
    expect(diff.isEqual).toBeFalse()
  })

  test('nó que saiu entra em removedNodeIds', () => {
    const next: FlowGraphData = { ...BASE, nodes: { menu: BASE.nodes.menu! } }
    const diff = diffWhatsAppFlowGraphs(BASE, next)
    expect(diff.removedNodeIds).toEqual(['about'])
  })

  test('nó com o mesmo id e conteúdo diferente entra em changedNodeIds', () => {
    const next: FlowGraphData = {
      ...BASE,
      nodes: { ...BASE.nodes, about: { directMessage: 'sobre novo', id: 'about', type: 'action' } },
    }
    const diff = diffWhatsAppFlowGraphs(BASE, next)
    expect(diff.changedNodeIds).toEqual(['about'])
    expect(diff.addedNodeIds).toEqual([])
    expect(diff.removedNodeIds).toEqual([])
  })

  test('label e nó inicial diferentes são sinalizados mesmo sem mudar os nós', () => {
    const next: FlowGraphData = { ...BASE, label: 'Novo rótulo' }
    const diff = diffWhatsAppFlowGraphs(BASE, next)
    expect(diff.labelChanged).toBeTrue()
    expect(diff.startNodeIdChanged).toBeFalse()
    expect(diff.isEqual).toBeFalse()
  })
})
