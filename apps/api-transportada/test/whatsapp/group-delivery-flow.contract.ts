/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T15: "entreguei" no grupo do motorista e as provas (foto e localização) que chegam ao grupo.
 */
import { describe, expect, test } from 'bun:test'

import type {
  WhatsAppDeliveryPreparationReply,
  WhatsAppDeliveryPreparations,
} from '../../src/whatsapp-commands/application/whatsapp-delivery-preparation.service.js'
import {
  createEvolutionGroupInbound,
  type AdmittedGroupMedia,
  type EvolutionMessageEvent,
  readGroupMedia,
} from '../../src/whatsapp/application/evolution-group-inbound.service.js'
import type { EvolutionGroupIdentity } from '../../src/whatsapp/application/evolution-group-identity.service.js'
import {
  createGroupDeliveryFlow,
  GROUP_DELIVERY_TEXT,
} from '../../src/whatsapp/application/whatsapp-group-delivery-flow.service.js'
import {
  createGroupDriverFlow,
  GROUP_DRIVER_TEXT,
} from '../../src/whatsapp/application/whatsapp-group-driver-flow.service.js'
import {
  createGroupProofIntake,
  GROUP_PROOF_TEXT,
} from '../../src/whatsapp/application/whatsapp-group-proof-intake.service.js'
import type {
  GroupFlowOutcome,
  GroupRequest,
} from '../../src/whatsapp/application/whatsapp-group-request.port.js'
import { createGroupStopFlow } from '../../src/whatsapp/application/whatsapp-group-stop-flow.service.js'
import { sameBrazilianPhone } from '../../src/whatsapp/infrastructure/whatsapp-group-delivery.adapter.js'

const GROUP = '120363025246125486@g.us'

const reply = (texts: string[], awaitingText = false): WhatsAppDeliveryPreparationReply => ({
  awaitingText,
  documentNumber: '17234',
  finished: false,
  texts,
})

function fakePreparations(
  options: { acceptsUnsolicited?: boolean; awaitingText?: boolean; open?: boolean } = {},
) {
  const calls: { method: string; input: unknown }[] = []
  const preparations: WhatsAppDeliveryPreparations = {
    async answer(input) {
      calls.push({ input, method: 'answer' })
      return input.text === 'pular' ? reply(['Ok, sem esse item.', 'Confirma?'], true) : null
    },
    async awaitingText() {
      return options.awaitingText ?? false
    },
    async begin(input) {
      calls.push({ input, method: 'begin' })
      return reply([`NF ${input.documentNumber}: mande a foto do canhoto assinado.`])
    },
    async acceptsUnsolicitedPhoto() {
      return options.acceptsUnsolicited ?? false
    },
    async hasOpen() {
      return options.open ?? true
    },
    async receiveLocation(input) {
      calls.push({ input, method: 'receiveLocation' })
      return options.open === false ? null : reply(['Localização recebida.'], true)
    },
    async receivePhoto(input) {
      calls.push({ input, method: 'receivePhoto' })
      return reply(['Foto do canhoto recebida.', 'Quem recebeu?'], true)
    },
  }
  return { calls, preparations }
}

function request(step: string, state: Record<string, unknown> = {}): GroupRequest {
  return {
    attempts: 0,
    companyId: 'C1',
    driverId: 'D1',
    expiresAt: new Date(),
    groupJid: GROUP,
    id: 'R1',
    ownerNumber: '5516988887777',
    state,
    step,
    version: 1n,
  }
}

function setupFlow(options: { awaitingText?: boolean; withoutAccess?: boolean } = {}) {
  const fake = fakePreparations(options)
  const delivery = createGroupDeliveryFlow({
    consumeLocation: () => null,
    findActorUserId: async () => (options.withoutAccess === true ? null : 'U1'),
    listOpenDocuments: async () => [
      { id: 'DOC1', number: '017234', recipientName: 'Padaria Sol' },
      { id: 'DOC2', number: '900' },
    ],
    preparations: fake.preparations,
    withoutAccessText: async () => 'sem acesso',
  })
  const flow = createGroupDriverFlow({
    delivery,
    occurrence: {
      answer: async () => ({ kind: 'done', replies: ['occ-answer'] }),
      initialStep: 'document',
      start: async () => ({ kind: 'done', replies: ['occ-start'] }),
    },
    stop: createGroupStopFlow({
      enRouteMessage: async () => 'en-route',
      listStops: async () => [],
      record: async () => ({ message: 'ok' }),
    }),
  })
  let current: GroupRequest = request('document')
  const turn = (text: string) => ({
    request: current,
    sender: '5516988887777',
    senderName: null,
    text,
  })
  const remember = (outcome: GroupFlowOutcome) => {
    if (outcome.kind === 'continue') current = request(outcome.step, { ...outcome.state })
    return outcome
  }
  return {
    answer: async (text: string) => remember(await flow.answer(turn(text))),
    calls: fake.calls,
    start: async (text: string) => remember(await flow.start(turn(text))),
  }
}

describe('grupo: entreguei abre a entrega em preparo', () => {
  test('"entreguei 17234" acha a nota pelo número (zeros à esquerda não contam) e repassa o que falta', async () => {
    const t = setupFlow()
    // A entrega aberta esperando a foto segura o pedido: o "pular" responde sem marcar o bot.
    expect(await t.start('entreguei 17234')).toEqual({
      kind: 'continue',
      replies: ['NF 17234: mande a foto do canhoto assinado.'],
      state: {},
      step: 'delivery.answer',
    })
    expect(t.calls[0]).toMatchObject({
      input: { channel: 'group', documentId: 'DOC1', documentNumber: '17234' },
      method: 'begin',
    })
  })

  test('sem a nota, lista as abertas com o cliente; responde pela opção', async () => {
    const t = setupFlow()
    const asked = await t.start('entreguei')
    expect(asked).toMatchObject({
      kind: 'continue',
      replies: [
        GROUP_DELIVERY_TEXT.askDocument([
          { id: 'DOC1', number: '017234', recipientName: 'Padaria Sol' },
          { id: 'DOC2', number: '900' },
        ]),
      ],
      step: 'delivery.choose',
    })
    expect(
      GROUP_DELIVERY_TEXT.askDocument([
        { id: 'DOC1', number: '017234', recipientName: 'Padaria Sol' },
      ]),
    ).toContain('1. NF 17234 · Padaria Sol')
    await t.answer('2')
    expect(t.calls[0]).toMatchObject({ input: { documentId: 'DOC2' }, method: 'begin' })
  })

  test('nota fora da viagem e lote recusam com frase sem dado do cliente', async () => {
    const t = setupFlow()
    expect(await t.start('entreguei 555')).toEqual({
      kind: 'done',
      replies: [GROUP_DELIVERY_TEXT.notFound('555')],
    })
    expect(await t.start('entreguei 17234 900')).toEqual({
      kind: 'done',
      replies: [GROUP_DELIVERY_TEXT.oneAtATime],
    })
  })

  test('motorista sem acesso ao app não abre preparação', async () => {
    const t = setupFlow({ withoutAccess: true })
    expect(await t.start('entreguei 17234')).toEqual({ kind: 'done', replies: ['sem acesso'] })
    expect(t.calls).toEqual([])
  })

  test('o menu ganha "Entreguei" como opção 3', async () => {
    const t = setupFlow()
    expect(await t.start('')).toMatchObject({ replies: [GROUP_DRIVER_TEXT.menu] })
    expect(GROUP_DRIVER_TEXT.menu).toBe(
      [
        'O que você quer lançar?',
        '*1* - 🚚 Saí para a entrega',
        '*2* - 📍 Cheguei',
        '*3* - ✅ Entreguei',
        '*4* - ⚠️ Ocorrência',
      ].join('\n'),
    )
    await t.answer('3')
    expect(await t.answer('1')).toMatchObject({ kind: 'continue', step: 'delivery.answer' })
    expect(t.calls[0]).toMatchObject({ input: { documentId: 'DOC1' }, method: 'begin' })
  })

  test('"@bot pular" responde a uma entrega em preparo antes de virar ocorrência', async () => {
    const t = setupFlow({ awaitingText: true })
    expect(await t.start('pular')).toMatchObject({ kind: 'continue', step: 'delivery.answer' })
    expect(await t.answer('pular')).toMatchObject({ kind: 'continue' })
  })
})

describe('grupo: foto e localização do motorista', () => {
  test('lê a foto (com legenda) e a localização do corpo cru; o resto fica de fora', () => {
    const media = readGroupMedia({
      data: [
        {
          key: { id: 'A' },
          message: { imageMessage: { caption: 'canhoto', mimetype: 'image/jpeg' } },
        },
        {
          key: { id: 'B' },
          message: { locationMessage: { degreesLatitude: -21.1, degreesLongitude: -47.8 } },
        },
        { key: { id: 'C' }, message: { audioMessage: {} } },
      ],
      event: 'messages.upsert',
    })
    expect(media.get('A')).toEqual({
      caption: 'canhoto',
      kind: 'image',
      mimeType: 'image/jpeg',
      rawMessage: {
        key: { id: 'A' },
        message: { imageMessage: { caption: 'canhoto', mimetype: 'image/jpeg' } },
      },
    })
    expect(media.get('B')).toEqual({ kind: 'location', latitude: -21.1, longitude: -47.8 })
    expect(media.has('C')).toBe(false)
  })

  test('o telefone da ficha casa com o número do WhatsApp, com ou sem o nono dígito', () => {
    expect(sameBrazilianPhone('16988887777', '5516988887777')).toBe(true)
    expect(sameBrazilianPhone('16988887777', '551688887777')).toBe(true)
    expect(sameBrazilianPhone('16988887777', '5516977776666')).toBe(false)
    expect(sameBrazilianPhone('', '5516988887777')).toBe(false)
  })

  const event = (overrides: Partial<EvolutionMessageEvent> = {}): EvolutionMessageEvent => ({
    chat: 'group',
    externalMessageId: 'M1',
    from: '',
    fromMe: false,
    groupJid: GROUP,
    mentionedJids: [],
    participant: '5516988887777',
    pushName: null,
    replyToExternalMessageId: null,
    text: null,
    timestamp: 1_790_000_000,
    type: 'message',
    ...overrides,
  })
  const identity: EvolutionGroupIdentity = {
    botNumber: async () => '5516900000001',
    lidDirectory: async () => new Map(),
  }
  const connection = async () => ({ apiKey: 'k', baseUrl: 'https://e', instanceName: 'i' })

  function inbound(isDriver: boolean) {
    const media: AdmittedGroupMedia[] = []
    const receiver = createEvolutionGroupInbound({
      findGroupDriver: async () => ({ driverId: 'D1' }),
      findOpenRequestOwner: async () => null,
      handle: async () => undefined,
      handleMedia: async (item) => {
        media.push(item)
      },
      identity,
      isGroupDriver: async () => isDriver,
    })
    return { media, receiver }
  }

  test('a mídia do motorista do grupo chega sem marcar o bot; a de outro membro, não', async () => {
    const photo = { caption: null, kind: 'image', mimeType: 'image/jpeg' } as const
    const driver = inbound(true)
    expect(
      await driver.receiver.receive({
        companyId: 'C1',
        connection,
        event: event(),
        media: photo,
        senderLid: null,
      }),
    ).toBe('media')
    expect(driver.media[0]).toMatchObject({
      driverId: 'D1',
      mentionsBot: false,
      providerMessageId: 'M1',
    })
    expect(
      await driver.receiver.receive({
        companyId: 'C1',
        connection,
        event: event({ externalMessageId: 'M2', mentionedJids: ['5516900000001@s.whatsapp.net'] }),
        media: { ...photo, caption: '@5516900000001' },
        senderLid: null,
      }),
    ).toBe('media')
    expect(driver.media[1]).toMatchObject({ mentionsBot: true, providerMessageId: 'M2' })
    const other = inbound(false)
    expect(
      await other.receiver.receive({
        companyId: 'C1',
        connection,
        event: event(),
        media: photo,
        senderLid: null,
      }),
    ).toBe('not_driver')
    expect(other.media).toEqual([])
  })

  test('a localização de quem abriu o pedido (sem ser o motorista) responde o passo da localização', async () => {
    const advanced: string[] = []
    const receiver = (advances: boolean) =>
      createEvolutionGroupInbound({
        advanceRequestLocation: async ({ sender }) => {
          advanced.push(sender)
          return advances
        },
        findGroupDriver: async () => ({ driverId: 'D1' }),
        findOpenRequestOwner: async () => null,
        handle: async () => undefined,
        handleMedia: async () => {
          throw new Error('não é prova de entrega')
        },
        identity,
        isGroupDriver: async () => false,
      })
    const location = { kind: 'location', latitude: -20.56, longitude: -47.36 } as const
    const input = { companyId: 'C1', connection, event: event(), media: location, senderLid: null }
    expect(await receiver(true).receive(input)).toBe('media')
    expect(await receiver(false).receive(input)).toBe('not_driver')
    const photo = { caption: null, kind: 'image', mimeType: 'image/jpeg' } as const
    expect(await receiver(true).receive({ ...input, media: photo })).toBe('not_driver')
    expect(advanced).toEqual(['5516988887777', '5516988887777'])
  })

  function intake(
    options: { open?: boolean; failDownload?: boolean; acceptsUnsolicited?: boolean } = {},
  ) {
    const fake = fakePreparations(options)
    const downloads: unknown[] = []
    const sent: string[][] = []
    const mentions: Array<string | undefined> = []
    const opened: string[] = []
    const locations: unknown[] = []
    const service = createGroupProofIntake({
      downloadMedia: async (input) => {
        downloads.push(input)
        if (options.failDownload === true) throw new Error('down')
        return {
          data: Buffer.from([1, 2, 3]).toString('base64'),
          mimeType: 'image/jpeg; charset=binary',
        }
      },
      findActorUserId: async () => 'U1',
      openAnswerRequest: async ({ ownerNumber }) => {
        opened.push(ownerNumber)
      },
      preparations: fake.preparations,
      forgetLocation: () => {
        locations.length = 0
      },
      rememberLocation: ({ location }) => locations.push(location),
      replies: {
        send: ({ mentionNumber, texts }) => {
          mentions.push(mentionNumber)
          sent.push([...texts])
        },
      },
      withoutAccessText: async () => 'sem acesso',
    })
    const handle = (media: AdmittedGroupMedia['media'], mentionsBot = false) =>
      service.handle({
        companyId: 'C1',
        connection,
        driverId: 'D1',
        groupJid: GROUP,
        media,
        mentionsBot,
        providerMessageId: 'M1',
        sender: '5516988887777',
        timestamp: 1_790_000_000,
      })
    return { calls: fake.calls, downloads, handle, locations, mentions, opened, sent }
  }

  test('a foto é baixada com a mensagem inteira do webhook (o Evolution não guarda a mensagem pelo id)', async () => {
    const t = intake({ open: true })
    const rawMessage = { key: { id: 'M1' }, message: { imageMessage: { mimetype: 'image/jpeg' } } }
    await t.handle({ caption: null, kind: 'image', mimeType: 'image/jpeg', rawMessage })
    expect(t.downloads).toEqual([{ connection, providerMessageId: 'M1', rawMessage }])
  })

  test('a foto baixada vai para a preparação e abre o pedido para a resposta em texto', async () => {
    const t = intake()
    await t.handle({ caption: null, kind: 'image', mimeType: 'image/jpeg' })
    expect(t.calls[0]).toMatchObject({
      input: { mimeType: 'image/jpeg', providerMessageId: 'M1' },
      method: 'receivePhoto',
    })
    expect(t.opened).toEqual(['5516988887777'])
    expect(t.sent).toEqual([['Foto do canhoto recebida.', 'Quem recebeu?']])
  })

  test('a resposta à foto marca quem a mandou', async () => {
    const t = intake()
    await t.handle({ caption: null, kind: 'image', mimeType: 'image/jpeg' })
    expect(t.mentions).toEqual(['5516988887777'])
  })

  test('foto sem entrega aberta e sem marcar o bot: o leitor do canhoto não entra, nem baixa', async () => {
    const t = intake({ acceptsUnsolicited: true, open: false })
    await t.handle({ caption: null, kind: 'image', mimeType: 'image/jpeg' })
    expect(t.downloads).toEqual([])
    expect(t.calls).toEqual([])
    expect(t.sent).toEqual([])
  })

  test('foto sem entrega aberta marcando o bot: vai ao leitor do canhoto', async () => {
    const t = intake({ acceptsUnsolicited: true, open: false })
    await t.handle({ caption: '@bot', kind: 'image', mimeType: 'image/jpeg' }, true)
    expect(t.calls[0]).toMatchObject({
      input: { allowsCanhotoReading: true },
      method: 'receivePhoto',
    })
  })

  test('foto pedida pela entrega aberta segue sem marcar, mas sem leitura automática', async () => {
    const t = intake({ open: true })
    await t.handle({ caption: null, kind: 'image', mimeType: 'image/jpeg' })
    expect(t.calls[0]).toMatchObject({
      input: { allowsCanhotoReading: false },
      method: 'receivePhoto',
    })
  })

  test('foto sem entrega em preparo não é baixada nem respondida', async () => {
    const t = intake({ open: false })
    await t.handle({ caption: null, kind: 'image', mimeType: 'image/jpeg' })
    expect(t.calls).toEqual([])
    expect(t.sent).toEqual([])
  })

  test('download que falha pede a foto de novo', async () => {
    const t = intake({ failDownload: true })
    await t.handle({ caption: null, kind: 'image', mimeType: 'image/jpeg' })
    expect(t.sent).toEqual([['Não consegui baixar a foto. Mande de novo, por favor.']])
  })

  test('localização sem pergunta aberta não fica guardada para um "cheguei" depois', async () => {
    const t = intake({ open: false })
    await t.handle({ kind: 'location', latitude: -21.1, longitude: -47.8 })
    expect(t.locations).toHaveLength(0)
    expect(t.sent[0]?.[0]).toContain(GROUP_PROOF_TEXT.locationNotAsked)
  })

  test('localização que a preparação aberta pediu vai a ela e também não fica guardada', async () => {
    const t = intake()
    await t.handle({ kind: 'location', latitude: -21.1, longitude: -47.8 })
    expect(t.calls[0]).toMatchObject({ method: 'receiveLocation' })
    expect(t.locations).toHaveLength(0)
  })
})
