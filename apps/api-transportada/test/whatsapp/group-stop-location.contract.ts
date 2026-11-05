/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T4.9 (RF24): no grupo, o "saí" e o "cheguei" pedem a localização opcional antes de registrar;
 * "pular" (falado ou digitado) registra sem ponto, a localização compartilhada registra com ele, e o ponto
 * de há pouco vale sem perguntar de novo.
 */
import { describe, expect, test } from 'bun:test'

import { LOCATION_PROMPT_TEXT } from '../../src/whatsapp-commands/domain/whatsapp-driver-route-offer.policy.js'
import { createGroupDriverFlow } from '../../src/whatsapp/application/whatsapp-group-driver-flow.service.js'
import type {
  GroupFlowOutcome,
  GroupRequest,
} from '../../src/whatsapp/application/whatsapp-group-request.port.js'
import {
  createGroupStopFlow,
  type GroupStopFlowPorts,
} from '../../src/whatsapp/application/whatsapp-group-stop-flow.service.js'

const OWNER = '5516988887777'

function request(step: string, state: Record<string, unknown> = {}): GroupRequest {
  return {
    attempts: 0,
    companyId: 'C1',
    driverId: 'D1',
    expiresAt: new Date(),
    groupJid: '1@g.us',
    id: 'R1',
    ownerNumber: OWNER,
    state,
    step,
    version: 1n,
  }
}

function setup(options: { readonly hasLocation: boolean; readonly isAddressReliable?: boolean }) {
  const recorded: Parameters<GroupStopFlowPorts['record']>[0][] = []
  const flow = createGroupDriverFlow({
    occurrence: {
      answer: async () => ({ kind: 'done', replies: ['occ'] }),
      initialStep: 'document',
      start: async () => ({ kind: 'done', replies: ['occ'] }),
    },
    stop: createGroupStopFlow({
      enRouteMessage: async () => 'a caminho',
      hasLocation: () => options.hasLocation,
      listStops: async () => [
        {
          arrivedAt: null,
          completedAt: null,
          documents: [{ number: '17234', separationStatus: 'loaded' }],
          enRouteSince: null,
          id: 'S1',
          isAddressReliable: options.isAddressReliable ?? true,
          sequence: 1,
        },
      ],
      record: async (input) => {
        recorded.push(input)
        return { message: input.event === 'depart' ? 'Saída registrada.' : 'Chegada registrada.' }
      },
    }),
  })
  let current = request(flow.initialStep)
  const turn = (text: string) => ({ request: current, sender: OWNER, senderName: null, text })
  const follow = (outcome: GroupFlowOutcome) => {
    if (outcome.kind === 'continue') current = request(outcome.step, { ...outcome.state })
    return outcome
  }
  return {
    answer: async (text: string) => follow(await flow.answer(turn(text))),
    answerAt: async (step: string, state: Record<string, unknown>, text: string) => {
      current = request(step, state)
      return follow(await flow.answer(turn(text)))
    },
    locationReceived: async () =>
      follow(
        (await flow.locationReceived?.({
          ...turn(''),
          location: { latitude: -21.17, longitude: -47.81 },
        })) ?? { kind: 'done', replies: [] },
      ),
    recorded,
    start: async (text: string) => follow(await flow.start(turn(text))),
    step: () => current.step,
  }
}

describe('grupo: o pedido de localização do "saí" e do "cheguei" (RF24)', () => {
  test.each([
    ['saí', 'depart'],
    ['cheguei', 'arrive'],
  ])('"%s" sem ponto recente pergunta antes de registrar', async (command, event) => {
    const t = setup({ hasLocation: false })
    const asked = await t.start(command)
    expect(asked).toMatchObject({
      kind: 'continue',
      replies: [LOCATION_PROMPT_TEXT.ask],
      step: 'stop.location',
    })
    expect(asked.kind === 'continue' ? asked.replies[0] : '').toBe(
      '📍 Mande sua localização pelo clipe, ou responda _pular_',
    )
    expect(t.recorded).toEqual([])
    t.recorded.length = 0
    await t.answer('pular')
    expect(t.recorded).toMatchObject([{ documentNumber: '17234', event, stopId: 'S1' }])
  })

  test('com a localização compartilhada há pouco, registra direto sem perguntar de novo', async () => {
    const t = setup({ hasLocation: true })
    expect(await t.start('cheguei')).toEqual({ kind: 'done', replies: ['Chegada registrada.'] })
    expect(t.recorded).toHaveLength(1)
  })

  test.each(['pular', 'Pular.', 'pula', 'pular por favor', 'não', '2'])(
    '"%s" (digitado ou falado) registra sem esperar o ponto',
    async (answer) => {
      const t = setup({ hasLocation: false })
      await t.start('saí')
      const done = await t.answer(answer)
      expect(done).toEqual({ kind: 'done', replies: ['Saída registrada.'] })
      expect(t.recorded).toHaveLength(1)
    },
  )

  test('a localização compartilhada pelo dono do pedido registra o evento (o ponto está lembrado)', async () => {
    const t = setup({ hasLocation: false })
    await t.start('cheguei')
    expect(await t.locationReceived()).toEqual({ kind: 'done', replies: ['Chegada registrada.'] })
    expect(t.recorded).toHaveLength(1)
  })

  test('localização fora do pedido de localização não registra nada', async () => {
    const t = setup({ hasLocation: false })
    expect(await t.locationReceived()).toEqual({ kind: 'done', replies: [] })
    expect(t.recorded).toEqual([])
  })

  test('outra resposta repete que o item vai por localização, sem registrar', async () => {
    const t = setup({ hasLocation: false })
    await t.start('saí')
    const again = await t.answer('estou chegando agora')
    expect(again).toMatchObject({ kind: 'not_understood', prompt: LOCATION_PROMPT_TEXT.askAgain })
    expect(t.recorded).toEqual([])
    expect(t.step()).toBe('stop.location')
  })

  test('a saída oferecida pela próxima rota também pergunta a localização', async () => {
    const t = setup({ hasLocation: false })
    const asked = await t.answerAt(
      'route.offer',
      { routeOffer: { documentNumber: '17300', stopId: 'S9' } },
      '1',
    )
    expect(asked).toMatchObject({ kind: 'continue', step: 'stop.location' })
    expect(t.recorded).toEqual([])
    await t.answer('pular')
    expect(t.recorded).toMatchObject([{ documentNumber: '17300', event: 'depart', stopId: 'S9' }])
  })
})

describe('grupo: "cheguei" em parada sem localização certa corrige o endereço (RF14)', () => {
  test('o pedido de localização explica que o ponto atualiza o endereço', async () => {
    const t = setup({ hasLocation: false, isAddressReliable: false })
    const asked = await t.start('cheguei')
    expect(asked).toMatchObject({
      kind: 'continue',
      replies: [LOCATION_PROMPT_TEXT.askUnreliableAddress],
    })
    expect(LOCATION_PROMPT_TEXT.askUnreliableAddress).toContain('eu atualizo o endereço')
  })

  test('parada confiável e "saí" mantêm o pedido simples', async () => {
    const reliable = setup({ hasLocation: false, isAddressReliable: true })
    expect(await reliable.start('cheguei')).toMatchObject({ replies: [LOCATION_PROMPT_TEXT.ask] })
    const departing = setup({ hasLocation: false, isAddressReliable: false })
    expect(await departing.start('saí')).toMatchObject({ replies: [LOCATION_PROMPT_TEXT.ask] })
  })

  test('a localização compartilhada antes vale: registra direto e o ponto vai com o evento', async () => {
    const t = setup({ hasLocation: true, isAddressReliable: false })
    expect(await t.start('cheguei')).toEqual({ kind: 'done', replies: ['Chegada registrada.'] })
    expect(t.recorded).toHaveLength(1)
  })

  test('a resposta do registro leva "Endereço atualizado" ou "Enviei para o escritório conferir"', async () => {
    const speech = await import(
      '../../src/whatsapp-commands/application/whatsapp-driver-event-speech.service.js'
    )
    const { CATALOG_BOT_SPEECH, renderBotSpeechLine } = await import(
      '../../src/whatsapp-commands/application/whatsapp-bot-speech.service.js'
    )
    const render = (addressCorrection: 'applied' | 'suggested') =>
      renderBotSpeechLine({
        companyId: 'C1',
        line: speech.describeWhatsAppDriverEventResult(
          { addressCorrection, event: 'arrive', kind: 'registered' },
          { documentNumber: '17234', kind: 'group' },
        ),
        speech: CATALOG_BOT_SPEECH,
      })
    expect(await render('applied')).toBe('Chegada registrada. 📍\nEndereço atualizado. ✅')
    expect(await render('suggested')).toContain('Enviei para o escritório conferir')
  })
})
