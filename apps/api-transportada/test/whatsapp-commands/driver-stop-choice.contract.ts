/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 T3.2 (RF4–RF7b, D3): a lista "Qual parada?" da conversa individual diz o mesmo texto do grupo, e a
 * resposta é o número da parada.
 */
import { describe, expect, test } from 'bun:test'

import type { WhatsAppStopCandidate } from '../../src/trips/domain/driver-stop-resolution.policy.js'
import { CATALOG_BOT_SPEECH } from '../../src/whatsapp-commands/application/whatsapp-bot-speech.service.js'
import { createWhatsAppDriverPrompts } from '../../src/whatsapp-commands/application/whatsapp-driver-prompts.service.js'
import {
  DRIVER_PROMPT_CONTEXT_KEY,
  DRIVER_PROMPT_KIND,
} from '../../src/whatsapp-commands/domain/whatsapp-driver-prompt.policy.js'

const NOW = new Date('2026-11-07T12:00:00.000Z')
const ACTOR = { actorUserId: 'U1', companyId: 'C1', driverId: 'D1' }

function stop(sequence: number, number: string, client: string): WhatsAppStopCandidate {
  return {
    arrivedAt: null,
    city: 'Franca',
    completedAt: null,
    coordinate: { latitude: -20.5, longitude: -47.4 },
    district: 'Centro',
    documents: [{ number, recipientName: client, separationStatus: 'loaded' }],
    enRouteSince: null,
    id: `S${sequence}`,
    sequence,
  }
}

const STOPS = [
  stop(1, '17234', 'PADARIA SOL'),
  stop(2, '17235', 'MERCADO LUA'),
  stop(3, '17236', 'ACOUGUE ESTRELA'),
]

function setup(travel: boolean) {
  return createWhatsAppDriverPrompts({
    clock: () => NOW,
    listStops: async () => STOPS,
    ports: {} as never,
    speech: CATALOG_BOT_SPEECH,
    stopListTravel: async () => ({
      byStopId: travel ? new Map([['S2', { distance: '3,2 km', duration: '~8 min' }]]) : new Map(),
      isLocationMissing: !travel,
    }),
  })
}

const JOURNEY_CONTEXT = {
  [DRIVER_PROMPT_CONTEXT_KEY]: {
    actions: [{ kind: 'choose_departure' }],
    kind: DRIVER_PROMPT_KIND.journeyActions,
    offeredAt: NOW.toISOString(),
    stopId: 'S1',
  },
}

const MAPS = 'https://www.google.com/maps/dir/?api=1&destination=-20.5,-47.4'

describe('a lista de paradas da conversa individual (spec 300)', () => {
  test('o texto é o da lista do grupo, com a próxima em citação e o 📎 sem localização', async () => {
    const result = await setup(false).answer({
      actor: ACTOR,
      context: JOURNEY_CONTEXT,
      text: '1',
      whatsappNumber: '5516999995151',
    })
    expect(result?.texts).toEqual([
      [
        '🚚 *Para qual parada você saiu?*',
        '',
        '> 👉 *PARADA 1 de 3* · _próxima da rota_',
        '> 🧾 NF `17234` · *PADARIA SOL*',
        '> 📍 Centro, Franca',
        `> 🗺️ *Como chegar:* ${MAPS}`,
        '',
        '*PARADA 2 de 3*',
        '🧾 NF `17235` · *MERCADO LUA*',
        '📍 Centro, Franca',
        `🗺️ *Como chegar:* ${MAPS}`,
        '',
        '*PARADA 3 de 3*',
        '🧾 NF `17236` · *ACOUGUE ESTRELA*',
        '📍 Centro, Franca',
        `🗺️ *Como chegar:* ${MAPS}`,
        '',
        '_Responda com o número da parada ou da nota._',
        '📎 _Mande sua localização pelo clipe para ver distância e tempo._',
      ].join('\n'),
    ])
  })

  test('com ponto, a parada que a estrada alcança ganha a linha de distância e tempo', async () => {
    const result = await setup(true).answer({
      actor: ACTOR,
      context: JOURNEY_CONTEXT,
      text: '1',
      whatsappNumber: '5516999995151',
    })
    expect(result?.texts[0]).toContain(
      '*PARADA 2 de 3*\n🧾 NF `17235` · *MERCADO LUA*\n📍 Centro, Franca\n📏 *3,2 km* · ⏱️ _~8 min_\n',
    )
    expect(result?.texts[0]).not.toContain('📎')
  })

  test('número fora da lista: o "não entendi" do desenho, com o intervalo, e o pedido segue aberto', async () => {
    const prompts = setup(true)
    const listed = await prompts.answer({
      actor: ACTOR,
      context: JOURNEY_CONTEXT,
      text: '1',
      whatsappNumber: '5516999995151',
    })
    const result = await prompts.answer({
      actor: ACTOR,
      context: listed?.context ?? {},
      text: '12',
      whatsappNumber: '5516999995151',
    })
    expect(result?.texts).toEqual([
      '🤔 *Não entendi.* Não achei a parada 12 nesta viagem.\n_Responda com o número da parada (1 a 3) ou da nota._',
    ])
    expect(result?.context).toEqual(listed?.context ?? {})
  })
})
