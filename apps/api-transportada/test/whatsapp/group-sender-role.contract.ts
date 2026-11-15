/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF18-RF20: quem mandou no grupo decide a regra — tripulação, atendente cadastrado ou ninguém.
 */
import { describe, expect, test } from 'bun:test'

import type {
  WhatsAppDeliveryPreparationReply,
  WhatsAppDeliveryPreparations,
} from '../../src/whatsapp-commands/application/whatsapp-delivery-preparation.service.js'
import type { ResolveWhatsAppActorResult } from '../../src/whatsapp-commands/application/resolve-whatsapp-actor.use-case.js'
import { deliverWhatsAppOfficeDocument } from '../../src/whatsapp-commands/application/whatsapp-office-delivery.service.js'
import { createGroupDeliveryFlow } from '../../src/whatsapp/application/whatsapp-group-delivery-flow.service.js'
import type { GroupRequest } from '../../src/whatsapp/application/whatsapp-group-request.port.js'
import {
  createWhatsAppSenderRoleResolver,
  isMediaSenderAllowed,
  SENDER_NOT_ALLOWED_TEXT,
  type WhatsAppSenderRolePorts,
} from '../../src/whatsapp/application/whatsapp-sender-role.service.js'
import {
  brazilianPhoneCandidates,
  createAttendantFinder,
  decideCrewPhoneMatch,
  sameBrazilianPhone,
} from '../../src/whatsapp/infrastructure/whatsapp-group-sender.adapter.js'

const CREW_PHONE = '5516988887777'
const ATTENDANT_PHONE = '5516977776666'
const STRANGER_PHONE = '5511900000000'

const ports: WhatsAppSenderRolePorts = {
  findAttendant: async ({ phone }) => (phone === ATTENDANT_PHONE ? { actorUserId: 'U9' } : null),
  isCrewMember: async ({ driverId, phone }) => driverId === 'D1' && phone === CREW_PHONE,
}
const resolveRole = createWhatsAppSenderRoleResolver(ports)

describe('quem mandou: tripulação, atendente ou ninguém', () => {
  test('telefone de motorista ou ajudante da frota é tripulação', async () => {
    expect(await resolveRole({ companyId: 'C1', driverId: 'D1', phone: CREW_PHONE })).toEqual({
      kind: 'crew',
    })
  })
  test('usuário com a baixa do escritório é atendente, com o id do usuário', async () => {
    expect(await resolveRole({ companyId: 'C1', driverId: 'D1', phone: ATTENDANT_PHONE })).toEqual({
      actorUserId: 'U9',
      kind: 'attendant',
    })
  })
  test('qualquer outro número é desconhecido', async () => {
    expect(await resolveRole({ companyId: 'C1', driverId: 'D1', phone: STRANGER_PHONE })).toEqual({
      kind: 'unknown',
    })
  })
  test('o número que é das duas coisas segue como tripulação', async () => {
    const both = createWhatsAppSenderRoleResolver({
      findAttendant: async () => ({ actorUserId: 'U9' }),
      isCrewMember: async () => true,
    })
    expect(await both({ companyId: 'C1', driverId: 'D1', phone: CREW_PHONE })).toEqual({
      kind: 'crew',
    })
  })
  test('a tripulação é a do grupo: o motorista de outro grupo não é tripulação aqui (S2)', async () => {
    expect(await resolveRole({ companyId: 'C1', driverId: 'D2', phone: CREW_PHONE })).toEqual({
      kind: 'unknown',
    })
  })
  test('o motorista de outro grupo que é atendente segue como atendente (S2)', async () => {
    const asAttendant = createWhatsAppSenderRoleResolver({
      findAttendant: async () => ({ actorUserId: 'U9' }),
      isCrewMember: async ({ driverId }) => driverId === 'D1',
    })
    expect(await asAttendant({ companyId: 'C1', driverId: 'D2', phone: CREW_PHONE })).toEqual({
      actorUserId: 'U9',
      kind: 'attendant',
    })
  })
  test('o telefone da ficha e o do WhatsApp se reconhecem com ou sem o nono dígito', () => {
    expect(sameBrazilianPhone('(16) 98888-7777', '551688887777')).toBe(true)
    expect(sameBrazilianPhone('(16) 98888-7777', '5511900000000')).toBe(false)
  })
})

const authorized = (permissions: readonly string[]): ResolveWhatsAppActorResult =>
  ({
    context: { scope: { kind: 'company', permissions: new Set(permissions), userId: 'U9' } },
    status: 'authorized',
  }) as unknown as ResolveWhatsAppActorResult

describe('telefone da tripulação: exato primeiro, nono dígito só sem ambiguidade (S2)', () => {
  test('o número do WhatsApp vira o exato e a forma com/sem o nono dígito', () => {
    expect(brazilianPhoneCandidates('5516988887777')).toEqual({
      alternate: '1688887777',
      exact: '16988887777',
    })
    expect(brazilianPhoneCandidates('551688887777')).toEqual({
      alternate: '16988887777',
      exact: '1688887777',
    })
    expect(brazilianPhoneCandidates('551633334444')).toEqual({
      alternate: null,
      exact: '1633334444',
    })
    expect(brazilianPhoneCandidates('')).toEqual({ alternate: null, exact: '' })
  })
  test('a ficha com o número exato decide, mesmo havendo a forma alternativa de outra pessoa', () => {
    const rows = [
      { isCrew: false, phone: '1688887777' },
      { isCrew: true, phone: '16988887777' },
    ]
    expect(decideCrewPhoneMatch(rows, '16988887777')).toBe(true)
    expect(decideCrewPhoneMatch(rows, '1688887777')).toBe(false)
  })
  test('sem número exato, a forma alternativa vale só quando é de uma ficha só', () => {
    expect(decideCrewPhoneMatch([{ isCrew: true, phone: '1688887777' }], '16988887777')).toBe(true)
    expect(
      decideCrewPhoneMatch(
        [
          { isCrew: true, phone: '1688887777' },
          { isCrew: false, phone: '1688887777' },
        ],
        '16988887777',
      ),
    ).toBe(false)
    expect(decideCrewPhoneMatch([], '16988887777')).toBe(false)
  })
})

describe('atendente: telefone verificado, vínculo ativo e a permissão da baixa do escritório', () => {
  const find = (result: ResolveWhatsAppActorResult) =>
    createAttendantFinder({ resolveActor: async () => result })({
      companyId: 'C1',
      phone: ATTENDANT_PHONE,
    })

  test('com trip.report-on-behalf é atendente', async () => {
    expect(await find(authorized(['trip.report-on-behalf']))).toEqual({ actorUserId: 'U9' })
  })
  test('vínculo sem a permissão da baixa é recusado', async () => {
    expect(await find(authorized(['fleet.read', 'trip.manage']))).toBeNull()
  })
  test('telefone não verificado ou sem vínculo ativo é recusado', async () => {
    expect(await find({ reason: 'unverified_or_expired', status: 'denied' })).toBeNull()
    expect(await find({ reason: 'no_membership', status: 'denied' })).toBeNull()
  })
})

function fakePreparations() {
  const calls: { method: string; input: unknown }[] = []
  const reply = (texts: string[]): WhatsAppDeliveryPreparationReply => ({
    awaitingText: false,
    documentNumber: '17234',
    finished: false,
    texts,
  })
  const preparations: WhatsAppDeliveryPreparations = {
    async answer(input) {
      calls.push({ input, method: 'answer' })
      return reply(['ok'])
    },
    async awaitingText() {
      return false
    },
    async begin(input) {
      calls.push({ input, method: 'begin' })
      return reply(['pergunta'])
    },
    async hasOpen() {
      return true
    },
    async receiveLocation() {
      return null
    },
    async receivePhoto() {
      return null
    },
  }
  return { calls, preparations }
}

const request = (): GroupRequest => ({
  attempts: 0,
  companyId: 'C1',
  driverId: 'D1',
  expiresAt: new Date(),
  groupJid: '1@g.us',
  id: 'R1',
  ownerNumber: CREW_PHONE,
  state: {},
  step: 'document',
  version: 1n,
})

function setupDelivery() {
  const fake = fakePreparations()
  const flow = createGroupDeliveryFlow({
    consumeLocation: () => null,
    findActorUserId: async () => 'DRIVER_USER',
    listOpenDocuments: async () => [{ id: 'DOC1', number: '17234' }],
    preparations: fake.preparations,
    resolveSenderRole: resolveRole,
    withoutAccessText: async () => 'sem acesso',
  })
  const turn = (sender: string, text: string) => ({
    request: request(),
    sender,
    senderName: null,
    text,
  })
  return { calls: fake.calls, flow, turn }
}

describe('grupo: a entrega por quem mandou (RF18, RF20)', () => {
  test('a tripulação baixa em nome do motorista do grupo, como antes', async () => {
    const t = setupDelivery()
    await t.flow.begin(t.turn(CREW_PHONE, 'entreguei 17234'), ['17234'])
    expect(t.calls[0]).toMatchObject({
      input: { actor: { actorUserId: 'DRIVER_USER', companyId: 'C1', driverId: 'D1' } },
      method: 'begin',
    })
    expect(JSON.stringify(t.calls[0])).not.toContain('attendant')
  })

  test('o atendente baixa em nome dele pelo escritório, para o motorista da viagem', async () => {
    const t = setupDelivery()
    await t.flow.begin(t.turn(ATTENDANT_PHONE, 'entreguei 17234'), ['17234'])
    expect(t.calls[0]).toMatchObject({
      input: { actor: { actorUserId: 'U9', attendant: true, companyId: 'C1', driverId: 'D1' } },
      method: 'begin',
    })
  })

  test('o atendente responde às perguntas da própria baixa como atendente', async () => {
    const t = setupDelivery()
    await t.flow.reply(t.turn(ATTENDANT_PHONE, 'pular'))
    expect(t.calls[0]).toMatchObject({
      input: { actor: { actorUserId: 'U9', attendant: true } },
      method: 'answer',
    })
  })

  test('número desconhecido não registra nada e recebe a recusa', async () => {
    const t = setupDelivery()
    expect(await t.flow.begin(t.turn(STRANGER_PHONE, 'entreguei 17234'), ['17234'])).toEqual({
      kind: 'done',
      replies: [SENDER_NOT_ALLOWED_TEXT],
    })
    expect(await t.flow.begin(t.turn(STRANGER_PHONE, 'entreguei'), [])).toEqual({
      kind: 'done',
      replies: ['Só a tripulação ou um atendente cadastrado registra a entrega.'],
    })
    expect(t.calls).toEqual([])
  })

  test('desconhecido que responde no meio da baixa não a fecha nem a anda', async () => {
    const t = setupDelivery()
    const outcome = await t.flow.reply(t.turn(STRANGER_PHONE, '1'))
    expect(outcome).toMatchObject({ kind: 'not_understood', reason: SENDER_NOT_ALLOWED_TEXT })
    expect(t.calls).toEqual([])
  })
})

describe('baixa do atendente pelo caminho do escritório', () => {
  test('chama a função do escritório com o usuário do atendente e o motorista da viagem', async () => {
    const received: unknown[] = []
    const result = await deliverWhatsAppOfficeDocument(
      {
        reportDelivery: async (input) => {
          received.push(input)
          return { alreadySettled: false, proofPending: true }
        },
      },
      {
        actorUserId: 'U9',
        attendant: true,
        companyId: 'C1',
        documentId: 'DOC1',
        driverId: 'D1',
        idempotencyKey: 'K1',
        location: null,
      },
    )
    expect(received).toEqual([
      {
        actorUserId: 'U9',
        companyId: 'C1',
        documentId: 'DOC1',
        driverId: 'D1',
        idempotencyKey: 'K1',
      },
    ])
    expect(result).toMatchObject({
      details: { proofPending: true },
      event: 'deliver',
      kind: 'registered',
    })
  })

  test('baixa repetida é "já registrada"; nota fora de alcance é recusa de negócio', async () => {
    const input = {
      actorUserId: 'U9',
      attendant: true as const,
      companyId: 'C1',
      documentId: 'DOC1',
      driverId: 'D1',
      idempotencyKey: 'K1',
      location: null,
    }
    expect(
      await deliverWhatsAppOfficeDocument(
        { reportDelivery: async () => ({ alreadySettled: true }) },
        input,
      ),
    ).toMatchObject({ kind: 'already_registered' })
    const { TripDocumentNotReachableError } = await import('../../src/trips/domain/trip.error.js')
    expect(
      await deliverWhatsAppOfficeDocument(
        {
          reportDelivery: async () => {
            throw new TripDocumentNotReachableError()
          },
        },
        input,
      ),
    ).toMatchObject({ kind: 'refused', refusal: { code: 'document_not_reachable' } })
  })
})

describe('foto e localização no grupo', () => {
  test('tripulação (ajudante incluído) e atendente valem como prova; número desconhecido não', async () => {
    const crew = await resolveRole({ companyId: 'C1', driverId: 'D1', phone: CREW_PHONE })
    const attendant = await resolveRole({ companyId: 'C1', driverId: 'D1', phone: ATTENDANT_PHONE })
    const stranger = await resolveRole({ companyId: 'C1', driverId: 'D1', phone: STRANGER_PHONE })
    expect(isMediaSenderAllowed(crew)).toBe(true)
    expect(isMediaSenderAllowed(attendant)).toBe(true)
    expect(isMediaSenderAllowed(stranger)).toBe(false)
  })
})
