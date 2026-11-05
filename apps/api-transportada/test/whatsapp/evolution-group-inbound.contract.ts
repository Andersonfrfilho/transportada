/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T3: o que o bot aceita de um grupo — lista de permissão por grupo, marcação do bot (por
 * número e por `@lid`) e a regra do dono do pedido.
 */
import { describe, expect, test } from 'bun:test'

import {
  createEvolutionGroupIdentity,
  type EvolutionGroupDirectoryGatewayPort,
  type EvolutionGroupParticipant,
} from '../../src/whatsapp/application/evolution-group-identity.service.js'
import {
  type AdmittedGroupMessage,
  createEvolutionGroupInbound,
  type EvolutionMessageEvent,
  readGroupSenderLids,
  toMessageSentAt,
} from '../../src/whatsapp/application/evolution-group-inbound.service.js'
import {
  decideGroupMessage,
  parseJid,
} from '../../src/whatsapp/domain/evolution-group-message.policy.js'
import { readGroupParticipants } from '../../src/whatsapp/infrastructure/evolution-connection.gateway.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-0000000000d1'
const GROUP = '120363025246125486@g.us'
const UNKNOWN_GROUP = '120363099999999999@g.us'
const BOT = '5516900000001'
const BOT_LID = '11111111111111'
const DRIVER = '5516988887777'
const DRIVER_LID = '22222222222222'
const SUPPORT = '5516977776666'
const SUPPORT_LID = '33333333333333'
const CONNECTION = { apiKey: 'chave', baseUrl: 'https://evolution.exemplo.com', instanceName: 'x' }

function message(overrides: Partial<EvolutionMessageEvent> = {}): EvolutionMessageEvent {
  return {
    chat: 'group',
    externalMessageId: 'M1',
    from: '',
    fromMe: false,
    groupJid: GROUP,
    mentionedJids: [],
    participant: DRIVER,
    pushName: 'Motorista',
    replyToExternalMessageId: null,
    text: 'oi',
    timestamp: 1,
    type: 'message',
    ...overrides,
  }
}

function setup(
  options: {
    failEvolution?: boolean
    openRequestOwner?: null | string
    ownerNumber?: null | string
    participants?: readonly EvolutionGroupParticipant[]
  } = {},
) {
  const state = {
    connections: 0,
    handled: [] as AdmittedGroupMessage[],
    ownerCalls: 0,
    participantCalls: 0,
  }
  const gateway: EvolutionGroupDirectoryGatewayPort = {
    async getOwnerNumber() {
      state.ownerCalls += 1
      if (options.failEvolution === true) throw new Error('evolution down')
      return options.ownerNumber === undefined ? BOT : options.ownerNumber
    },
    async listGroupParticipants({ groupJid }) {
      state.participantCalls += 1
      if (options.failEvolution === true) throw new Error('evolution down')
      expect(groupJid).toBe(GROUP)
      return (
        options.participants ?? [
          { lid: BOT_LID, number: BOT },
          { lid: DRIVER_LID, number: DRIVER },
          { lid: SUPPORT_LID, number: SUPPORT },
        ]
      )
    },
  }
  const inbound = createEvolutionGroupInbound({
    async findGroupDriver({ companyId, groupJid }) {
      return companyId === COMPANY_ID && groupJid === GROUP ? { driverId: DRIVER_ID } : null
    },
    async findOpenRequestOwner() {
      return options.openRequestOwner ?? null
    },
    async handle(admitted) {
      state.handled.push(admitted)
    },
    identity: createEvolutionGroupIdentity({ gateway }),
  })
  const receive = (
    event: EvolutionMessageEvent,
    extra: { companyId?: string; senderLid?: null | string } = {},
  ) =>
    inbound.receive({
      companyId: extra.companyId ?? COMPANY_ID,
      connection: async () => {
        state.connections += 1
        return CONNECTION
      },
      event,
      senderLid: extra.senderLid ?? null,
    })
  return { receive, state }
}

describe('grupo do motorista: lista de permissão', () => {
  test('grupo fora da ficha de um motorista é ignorado sem nenhuma chamada ao Evolution', async () => {
    const { receive, state } = setup()

    expect(
      await receive(message({ groupJid: UNKNOWN_GROUP, mentionedJids: [`${BOT}@s.whatsapp.net`] })),
    ).toBe('unknown_group')
    expect(state.connections).toBe(0)
    expect(state.handled).toEqual([])
  })

  test('o grupo de uma empresa não vale para outra', async () => {
    const { receive, state } = setup()

    expect(
      await receive(message({ mentionedJids: [`${BOT}@s.whatsapp.net`] }), {
        companyId: OTHER_COMPANY_ID,
      }),
    ).toBe('unknown_group')
    expect(state.handled).toEqual([])
  })

  test('a própria mensagem, mensagem sem texto e a do número do bot são ignoradas', async () => {
    const { receive, state } = setup()
    const mention = [`${BOT}@s.whatsapp.net`]

    expect(await receive(message({ fromMe: true, mentionedJids: mention }))).toBe('from_me')
    expect(await receive(message({ mentionedJids: mention, text: null }))).toBe('no_text')
    expect(await receive(message({ mentionedJids: mention, participant: BOT }))).toBe('own_number')
    expect(state.handled).toEqual([])
  })
})

describe('grupo do motorista: marcação do bot', () => {
  test('marcar o bot pelo número abre a conversa, com a marcação tirada do texto', async () => {
    const { receive, state } = setup()

    const outcome = await receive(
      message({
        mentionedJids: [`${BOT}@s.whatsapp.net`],
        text: `@${BOT} prorrogação de boleto 17234`,
      }),
    )

    expect(outcome).toBe('admitted')
    expect(state.participantCalls).toBe(0)
    expect(state.handled).toEqual([
      {
        companyId: COMPANY_ID,
        driverId: DRIVER_ID,
        groupJid: GROUP,
        providerMessageId: 'M1',
        replyToProviderMessageId: null,
        requestOwner: null,
        sender: DRIVER,
        senderName: 'Motorista',
        sentAt: new Date(1_000),
        text: 'prorrogação de boleto 17234',
        via: 'mention',
      },
    ])
  })

  test('spec 294: a hora do WhatsApp (messageTimestamp, segundos) vai junto; ausente, a mensagem é de agora', () => {
    expect(toMessageSentAt(1_793_900_000)).toEqual(new Date(1_793_900_000_000))
    expect(toMessageSentAt(null)).toBeUndefined()
    expect(toMessageSentAt(0)).toBeUndefined()
    expect(toMessageSentAt(Number.NaN)).toBeUndefined()
  })

  test('marcar o bot pelo @lid casa pelo participante do grupo (o SDK só casa por número)', async () => {
    const { receive, state } = setup()

    expect(
      await receive(
        message({ mentionedJids: [`${BOT_LID}@lid`], text: `@${BOT_LID}   prorrogação` }),
      ),
    ).toBe('admitted')
    expect(state.handled[0]?.text).toBe('prorrogação')
    expect(state.participantCalls).toBe(1)
  })

  test('só marcar o bot chega com texto vazio (o pedido guiado)', async () => {
    const { receive, state } = setup()

    expect(
      await receive(message({ mentionedJids: [`${BOT}@s.whatsapp.net`], text: `@${BOT}` })),
    ).toBe('admitted')
    expect(state.handled[0]?.text).toBe('')
  })

  test('marcar outra pessoa, pelo número ou pelo @lid, não chama o bot', async () => {
    const { receive, state } = setup()

    expect(
      await receive(
        message({ mentionedJids: [`${SUPPORT}@s.whatsapp.net`], text: `@${SUPPORT} oi` }),
      ),
    ).toBe('not_addressed')
    expect(
      await receive(message({ mentionedJids: [`${SUPPORT_LID}@lid`], text: `@${SUPPORT_LID} oi` })),
    ).toBe('not_addressed')
    expect(state.handled).toEqual([])
  })

  test('um @lid com os mesmos dígitos do número do bot não é o bot', () => {
    expect(
      decideGroupMessage({
        botLids: new Set(),
        botNumber: BOT,
        fromMe: false,
        groupRegistered: true,
        mentionedJids: [`${BOT}@lid`],
        requestOwner: null,
        sender: DRIVER,
        text: 'oi',
      }),
    ).toEqual({ admitted: false, reason: 'not_addressed' })
  })

  test('texto que só cita o número do bot, sem a marcação de verdade, não chama o bot', async () => {
    const { receive, state } = setup()

    expect(await receive(message({ text: `@${BOT} prorrogação` }))).toBe('not_addressed')
    expect(state.handled).toEqual([])
  })
})

describe('grupo do motorista: dono do pedido', () => {
  test('sem marcação e sem pedido aberto, a conversa do grupo é ignorada', async () => {
    const { receive, state } = setup()

    expect(await receive(message({ text: '17234' }))).toBe('not_addressed')
    expect(state.handled).toEqual([])
  })

  test('com pedido aberto, o dono responde sem marcar', async () => {
    const { receive, state } = setup({ openRequestOwner: DRIVER })

    expect(await receive(message({ text: ' 17234 ' }))).toBe('admitted')
    expect(state.handled[0]).toMatchObject({
      requestOwner: DRIVER,
      sender: DRIVER,
      text: '17234',
      via: 'owner_reply',
    })
  })

  test('com pedido aberto, outra pessoa sem marcar é ignorada; marcando, é aceita e registrada como ela', async () => {
    const { receive, state } = setup({ openRequestOwner: DRIVER })

    expect(await receive(message({ participant: SUPPORT, text: 'sim' }))).toBe('not_addressed')
    expect(
      await receive(
        message({
          mentionedJids: [`${BOT}@s.whatsapp.net`],
          participant: SUPPORT,
          text: `@${BOT} sim`,
        }),
      ),
    ).toBe('admitted')
    expect(state.handled).toHaveLength(1)
    expect(state.handled[0]).toMatchObject({
      requestOwner: DRIVER,
      sender: SUPPORT,
      text: 'sim',
      via: 'mention',
    })
  })

  test('o dono que escreve só com @lid é traduzido pelo participante do grupo', async () => {
    const { receive, state } = setup({ openRequestOwner: DRIVER })

    expect(
      await receive(message({ participant: '', text: 'sim' }), { senderLid: DRIVER_LID }),
    ).toBe('admitted')
    expect(state.handled[0]?.sender).toBe(DRIVER)
  })

  test('quem escreve só com @lid sem tradução é ignorado', async () => {
    const { receive, state } = setup({ openRequestOwner: DRIVER })

    expect(await receive(message({ participant: '', text: 'sim' }), { senderLid: '4444' })).toBe(
      'unknown_sender',
    )
    expect(await receive(message({ participant: '', text: 'sim' }))).toBe('unknown_sender')
    expect(state.handled).toEqual([])
  })
})

describe('grupo do motorista: o Evolution fora fecha a porta', () => {
  test('falha ao ler o número do bot ou os participantes não aceita nada', async () => {
    const failing = setup({ failEvolution: true })
    expect(await failing.receive(message({ mentionedJids: [`${BOT}@s.whatsapp.net`] }))).toBe(
      'identity_unavailable',
    )

    const unknownBot = setup({ ownerNumber: null })
    expect(await unknownBot.receive(message({ mentionedJids: [`${BOT}@s.whatsapp.net`] }))).toBe(
      'identity_unavailable',
    )
    expect([...failing.state.handled, ...unknownBot.state.handled]).toEqual([])
  })
})

describe('grupo do motorista: cache de quem é quem', () => {
  function counting(participants: () => readonly EvolutionGroupParticipant[]) {
    const calls = { owner: 0, participants: 0 }
    let now = 0
    const identity = createEvolutionGroupIdentity({
      clock: () => now,
      gateway: {
        async getOwnerNumber() {
          calls.owner += 1
          return BOT
        },
        async listGroupParticipants() {
          calls.participants += 1
          return participants()
        },
      },
      ownerTtlMs: 1000,
      participantsTtlMs: 1000,
      refreshAfterMs: 100,
    })
    return {
      advance: (ms: number) => {
        now += ms
      },
      calls,
      identity,
    }
  }
  const connection = async () => CONNECTION

  test('o número do bot é lido uma vez por janela', async () => {
    const { advance, calls, identity } = counting(() => [])
    await identity.botNumber({ companyId: COMPANY_ID, connection })
    await identity.botNumber({ companyId: COMPANY_ID, connection })
    expect(calls.owner).toBe(1)
    advance(1000)
    await identity.botNumber({ companyId: COMPANY_ID, connection })
    expect(calls.owner).toBe(2)
  })

  test('um @lid novo relê a lista, mas no máximo uma vez a cada refreshAfterMs', async () => {
    let list: EvolutionGroupParticipant[] = [{ lid: DRIVER_LID, number: DRIVER }]
    const { advance, calls, identity } = counting(() => list)
    const read = (lids: string[]) =>
      identity.lidDirectory({ companyId: COMPANY_ID, connection, groupJid: GROUP, lids })

    await read([DRIVER_LID])
    await read([DRIVER_LID])
    expect(calls.participants).toBe(1)

    list = [...list, { lid: SUPPORT_LID, number: SUPPORT }]
    expect((await read([SUPPORT_LID])).get(SUPPORT_LID)).toBeUndefined()
    expect(calls.participants).toBe(1)

    advance(100)
    expect((await read([SUPPORT_LID])).get(SUPPORT_LID)).toBe(SUPPORT)
    expect(calls.participants).toBe(2)
  })
})

describe('grupo do motorista: leitura das respostas do Evolution', () => {
  test('participantes com o @lid no id e o número ao lado, ou o contrário', () => {
    expect(
      readGroupParticipants({
        participants: [
          { admin: null, id: `${DRIVER_LID}@lid`, phoneNumber: `${DRIVER}@s.whatsapp.net` },
          { admin: 'admin', id: `${SUPPORT}@s.whatsapp.net`, lid: `${SUPPORT_LID}@lid` },
          { id: `${BOT}:12@s.whatsapp.net` },
          { id: 'lixo' },
          null,
        ],
      }),
    ).toEqual([
      { lid: DRIVER_LID, number: DRIVER },
      { lid: SUPPORT_LID, number: SUPPORT },
      { lid: null, number: BOT },
    ])
    expect(readGroupParticipants(null)).toEqual([])
  })

  test('o @lid de quem escreveu sai do corpo cru, por id de mensagem', () => {
    const lids = readGroupSenderLids({
      data: [
        { key: { id: 'A', participant: `${DRIVER_LID}@lid`, remoteJid: GROUP } },
        { key: { id: 'B', participant: `${SUPPORT}@s.whatsapp.net`, remoteJid: GROUP } },
        { key: { id: 'C', participantAlt: `${SUPPORT_LID}@lid`, remoteJid: GROUP } },
      ],
      event: 'messages.upsert',
    })
    expect([...lids]).toEqual([
      ['A', DRIVER_LID],
      ['C', SUPPORT_LID],
    ])
    expect(readGroupSenderLids({ data: 'x' }).size).toBe(0)
  })

  test('o sufixo de dispositivo sai antes dos dígitos', () => {
    expect(parseJid(`${BOT}:3@s.whatsapp.net`)).toEqual({ digits: BOT, server: 'user' })
    expect(parseJid(`${BOT_LID}@lid`)).toEqual({ digits: BOT_LID, server: 'lid' })
    expect(parseJid('@lid')).toBeNull()
  })
})
