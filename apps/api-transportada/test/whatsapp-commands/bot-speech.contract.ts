/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 T8 (RF7): as falas do bot são nós `fala_*` do grafo raiz, editáveis no editor de fluxos.
 */
import { describe, expect, test } from 'bun:test'
import type { FlowGraphData } from '@adatechnology/meta-whatsapp-contracts'

import { createGraphBotSpeech } from '../../src/whatsapp-commands/application/whatsapp-bot-speech.service.js'
import {
  BOT_SPEECH_DEFAULTS,
  botSpeechNodeId,
  type BotSpeechKey,
} from '../../src/whatsapp-commands/domain/whatsapp-bot-speech.constant.js'
import {
  buildBotSpeechNodes,
  interpolateBotSpeech,
  preserveEditedBotSpeech,
} from '../../src/whatsapp-commands/domain/whatsapp-bot-speech.policy.js'
import { validateFlowGraphForWhatsApp } from '../../src/whatsapp-commands/domain/whatsapp-menu.policy.js'
import {
  WHATSAPP_ROOT_FLOW_GRAPH,
  WHATSAPP_ROOT_FLOW_GRAPH_KEY,
} from '../../src/whatsapp-commands/infrastructure/whatsapp-flow-graph.constant.js'

const KEYS = Object.keys(BOT_SPEECH_DEFAULTS) as BotSpeechKey[]

function graphWith(nodes: FlowGraphData['nodes']): FlowGraphData {
  return { key: WHATSAPP_ROOT_FLOW_GRAPH_KEY, label: 'x', nodes, startNodeId: 'menu', version: 3 }
}

describe('falas do bot como nós do grafo (spec 286 T8)', () => {
  test('o grafo raiz publica um nó por fala, com id válido e sem violação', () => {
    for (const key of KEYS) {
      const node = WHATSAPP_ROOT_FLOW_GRAPH.nodes[botSpeechNodeId(key)]
      expect(node?.directMessage).toBe(BOT_SPEECH_DEFAULTS[key])
      expect(botSpeechNodeId(key)).toMatch(/^fala_[a-z0-9_]+$/)
    }
    expect(validateFlowGraphForWhatsApp(WHATSAPP_ROOT_FLOW_GRAPH)).toEqual([])
  })

  test('interpola {{variável}} e deixa a que faltou à vista', () => {
    expect(interpolateBotSpeech('{{a}} de {{b}}', { a: 1 })).toBe('1 de {{b}}')
  })

  test('usa o texto editado do grafo publicado, e o padrão se o nó sumiu ou ficou vazio', async () => {
    const edited = graphWith({
      [botSpeechNodeId('tripUnavailable')]: {
        directMessage: 'Viagem indisponível.',
        id: botSpeechNodeId('tripUnavailable'),
        type: 'action',
      },
      [botSpeechNodeId('operatorNoTrips')]: {
        directMessage: '  ',
        id: botSpeechNodeId('operatorNoTrips'),
        type: 'action',
      },
    })
    const speech = createGraphBotSpeech({
      repository: { create: async () => edited, get: async () => edited, save: async () => edited },
      rootFlowKey: WHATSAPP_ROOT_FLOW_GRAPH_KEY,
    })
    expect(await speech.text({ companyId: 'c', key: 'tripUnavailable' })).toBe(
      'Viagem indisponível.',
    )
    expect(await speech.text({ companyId: 'c', key: 'operatorNoTrips' })).toBe(
      BOT_SPEECH_DEFAULTS.operatorNoTrips,
    )
    expect(
      await speech.text({ companyId: 'c', key: 'driverNoteTooLong', params: { max: 280 } }),
    ).toContain('máximo 280')
  })

  test('falha ao ler o grafo não deixa o bot mudo', async () => {
    const errors: unknown[] = []
    const speech = createGraphBotSpeech({
      onReadError: (error) => errors.push(error),
      repository: {
        create: async () => graphWith({}),
        get: async () => Promise.reject(new Error('db down')),
        save: async () => graphWith({}),
      },
      rootFlowKey: WHATSAPP_ROOT_FLOW_GRAPH_KEY,
    })
    expect(await speech.text({ companyId: 'c', key: 'driverNoActiveTrip' })).toBe(
      BOT_SPEECH_DEFAULTS.driverNoActiveTrip,
    )
    expect(errors).toHaveLength(1)
  })

  test('republicar pelo código preserva a fala editada e traz a nova', () => {
    const id = botSpeechNodeId('tripUnavailable')
    const current = graphWith({ [id]: { directMessage: 'Editada.', id, type: 'action' } })
    const next = graphWith(buildBotSpeechNodes())
    const merged = preserveEditedBotSpeech(current, next)
    expect(merged.nodes[id]?.directMessage).toBe('Editada.')
    expect(merged.nodes[botSpeechNodeId('operatorNoTrips')]?.directMessage).toBe(
      BOT_SPEECH_DEFAULTS.operatorNoTrips,
    )
  })
})
