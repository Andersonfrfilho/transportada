/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 (os fluxos do bot nunca interferem): com um fluxo esperando resposta, cada tipo de entrada
 * (localização, "1", "2", "pular", "cancelar", texto livre, transcrição de áudio) só é tratado por quem
 * fez a pergunta — nenhum outro fluxo é chamado nem tem o estado alterado.
 */
import { describe, expect, test } from 'bun:test'

import { createGroupDriverFlow } from '../../src/whatsapp/application/whatsapp-group-driver-flow.service.js'
import { GROUP_OCCURRENCE_STEP } from '../../src/whatsapp/application/whatsapp-group-occurrence-flow.service.js'
import type {
  GroupFlowOutcome,
  GroupFlowTurn,
  GroupRequest,
} from '../../src/whatsapp/application/whatsapp-group-request.port.js'
import { createGroupStopFlow } from '../../src/whatsapp/application/whatsapp-group-stop-flow.service.js'

type Owner = 'close' | 'delivery' | 'occurrence' | 'route' | 'stop' | 'driver'
type Calls = Record<'close' | 'delivery' | 'occurrence', string[]>

const OWNER_NUMBER = '5516988887777'
const LOCATION = { latitude: -20.5673337, longitude: -47.3604457 }
const INPUTS = ['1', '2', 'pular', 'cancelar', 'texto livre qualquer', '1 sim, pode ser'] as const

const request = (step: string, state: Record<string, unknown>): GroupRequest => ({
  attempts: 0,
  companyId: 'C1',
  driverId: 'D1',
  expiresAt: new Date(),
  groupJid: '1@g.us',
  id: 'R1',
  ownerNumber: OWNER_NUMBER,
  state,
  step,
  version: 1n,
})

function setup() {
  const calls: Calls = { close: [], delivery: [], occurrence: [] }
  const recorded: unknown[] = []
  const spy = (name: keyof Calls, step: string): GroupFlowOutcome => {
    calls[name].push(step)
    return { kind: 'continue', replies: [name], state: {}, step: 'inner' }
  }
  const flow = createGroupDriverFlow({
    delivery: {
      answer: async (turn: GroupFlowTurn) => spy('delivery', turn.request.step),
      awaitingText: async () => false,
      begin: async () => spy('delivery', 'begin'),
      hasOpen: async () => false,
    } as never,
    occurrence: {
      answer: async (turn) => spy('occurrence', turn.request.step),
      initialStep: GROUP_OCCURRENCE_STEP.document,
      locationReceived: (turn) =>
        turn.request.step === GROUP_OCCURRENCE_STEP.location
          ? spy('occurrence', `location@${turn.request.step}`)
          : null,
      start: async () => spy('occurrence', 'start'),
    },
    stop: createGroupStopFlow({
      enRouteMessage: async () => 'a caminho',
      hasLocation: () => false,
      listStops: async () => [],
      record: async (input) => {
        recorded.push(input)
        return { message: 'registrado' }
      },
    }),
    tripClose: {
      answer: async (turn: GroupFlowTurn) => spy('close', turn.request.step),
      begin: async () => spy('close', 'begin'),
      matches: () => false,
    } as never,
  })
  return { calls, flow, recorded }
}

const ONE_STOP = [{ id: 'S1', isAddressReliable: true, label: 'NF 1', numbers: ['1'] }]
const TARGET = { documentNumber: '1', event: 'depart', stopId: 'S1' }

const PENDING: readonly {
  readonly owner: Owner
  readonly state: Record<string, unknown>
  readonly step: string
}[] = [
  { owner: 'stop', state: { event: 'depart', stops: ONE_STOP }, step: 'stop.choose' },
  { owner: 'stop', state: { locationFor: TARGET }, step: 'stop.location' },
  { owner: 'stop', state: { outOfOrderFor: TARGET }, step: 'stop.confirm_order' },
  { owner: 'route', state: { routeOffer: { stopId: 'S1' } }, step: 'route.offer' },
  { owner: 'close', state: {}, step: 'close.confirm' },
  { owner: 'delivery', state: {}, step: 'delivery.collect' },
  { owner: 'driver', state: {}, step: 'menu' },
  ...Object.values(GROUP_OCCURRENCE_STEP).map((step) => ({
    owner: 'occurrence' as const,
    state: {},
    step,
  })),
]

const OWNED_CALLS: Record<Owner, keyof Calls | undefined> = {
  close: 'close',
  delivery: 'delivery',
  driver: undefined,
  occurrence: 'occurrence',
  route: undefined,
  stop: undefined,
}

function expectOnlyOwnerCalled(calls: Calls, owner: Owner): void {
  for (const name of ['close', 'delivery', 'occurrence'] as const) {
    if (OWNED_CALLS[owner] === name) continue
    // O menu abre a ocorrência quando o motorista escreve a frase inteira (spec 292): só o `start`.
    const allowed = owner === 'driver' && name === 'occurrence' ? ['start'] : []
    expect(calls[name].filter((call) => !allowed.includes(call))).toEqual([])
  }
}

describe('isolamento dos fluxos do grupo: só quem perguntou trata a resposta', () => {
  for (const pending of PENDING) {
    for (const input of INPUTS) {
      test(`${pending.step} esperando: "${input}" é só do fluxo ${pending.owner}`, async () => {
        const { calls, flow } = setup()
        const outcome = await flow.answer({
          request: request(pending.step, pending.state),
          sender: OWNER_NUMBER,
          senderName: null,
          text: input,
        })
        expectOnlyOwnerCalled(calls, pending.owner)
        if (outcome.kind === 'continue' && pending.owner === 'stop') {
          expect(outcome.step.startsWith('stop.')).toBe(true)
        }
        if (outcome.kind === 'continue' && pending.owner === 'route') {
          expect(outcome.step.startsWith('stop.')).toBe(true)
        }
        if (outcome.kind === 'continue' && pending.owner === 'delivery') {
          expect(outcome.step).toBe('delivery.inner')
        }
        if (outcome.kind === 'continue' && pending.owner === 'close') {
          expect(outcome.step).toBe('close.inner')
        }
      })
    }

    test(`${pending.step} esperando: a localização é só do fluxo ${pending.owner}`, async () => {
      const { calls, flow, recorded } = setup()
      const outcome = await flow.locationReceived?.({
        location: LOCATION,
        request: request(pending.step, pending.state),
        sender: OWNER_NUMBER,
        senderName: null,
        text: '',
      })
      expectOnlyOwnerCalled(calls, pending.owner)
      const wantsLocation =
        pending.step === 'stop.location' || pending.step === GROUP_OCCURRENCE_STEP.location
      if (!wantsLocation) {
        expect(outcome ?? null).toBeNull()
        expect(recorded).toEqual([])
      }
    })
  }

  test.each(['stop.bogus', 'delivery.bogus', 'close.bogus', 'route.bogus', 'bogus.location'])(
    'passo sem dono (%s) não é consumido por nenhum fluxo',
    async (step) => {
      const { calls, flow, recorded } = setup()
      const turn = {
        request: request(step, { locationFor: TARGET, routeOffer: { stopId: 'S1' } }),
        sender: OWNER_NUMBER,
        senderName: null,
        text: '1',
      }
      expect(await flow.answer(turn)).toMatchObject({ kind: 'not_understood' })
      expect(await flow.locationReceived?.({ ...turn, location: LOCATION })).toBeNull()
      expect(calls).toEqual({ close: [], delivery: [], occurrence: [] })
      expect(recorded).toEqual([])
    },
  )

  for (const pending of PENDING) {
    test(`${pending.step} esperando: "cancelar" só chega ao fluxo ${pending.owner}`, async () => {
      const { calls, flow } = setup()
      const outcome = await flow.cancel?.({
        request: request(pending.step, pending.state),
        sender: OWNER_NUMBER,
        senderName: null,
        text: 'cancelar',
      })
      expectOnlyOwnerCalled(calls, pending.owner)
      // Só a entrega em preparo encerra do jeito dela; os demais deixam o pedido fechar como cancelado.
      if (pending.owner !== 'delivery') expect(outcome ?? null).toBeNull()
    })
  }

  test('passo que nenhum fluxo reconhece não é consumido pela ocorrência', async () => {
    const { calls, flow } = setup()
    const turn = {
      request: request('location_orphan', {}),
      sender: OWNER_NUMBER,
      senderName: null,
      text: '1',
    }
    expect(await flow.answer(turn)).toMatchObject({ kind: 'not_understood' })
    expect(await flow.locationReceived?.({ ...turn, location: LOCATION })).toBeNull()
    expect(calls).toEqual({ close: [], delivery: [], occurrence: [] })
  })

  test('o resumo de ocorrência nunca sai da localização de outro fluxo (regressão do "iniciar rota")', async () => {
    const { calls, flow } = setup()
    const asked = await flow.answer({
      request: request('stop.choose', { event: 'depart', stops: [...ONE_STOP, ...ONE_STOP] }),
      sender: OWNER_NUMBER,
      senderName: null,
      text: '1',
    })
    expect(asked).toMatchObject({ kind: 'continue', step: 'stop.location' })
    const located = await flow.locationReceived?.({
      location: LOCATION,
      request: request('stop.location', asked.kind === 'continue' ? { ...asked.state } : {}),
      sender: OWNER_NUMBER,
      senderName: null,
      text: '',
    })
    expect(located).toMatchObject({ kind: 'done' })
    expect(calls.occurrence).toEqual([])
  })
})
