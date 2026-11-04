/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T9: o áudio do bot — transcrição pelo worker e confirmação obrigatória antes de seguir.
 */
import { describe, expect, test } from 'bun:test'

import {
  createEvolutionGroupIdentity,
  type EvolutionGroupDirectoryGatewayPort,
} from '../../src/whatsapp/application/evolution-group-identity.service.js'
import {
  type AdmittedGroupMessage,
  BOT_AUDIO_RETRY_WINDOW_MS,
  createEvolutionGroupInbound,
  type EvolutionMessageEvent,
  type GroupAudio,
  type GroupAudioContext,
  readGroupAudio,
} from '../../src/whatsapp/application/evolution-group-inbound.service.js'
import {
  BOT_AUDIO_SPEECH,
  botAudioConfirmationText,
  createWhatsAppBotAudio,
  joinSpokenNumbers,
} from '../../src/whatsapp/application/whatsapp-bot-audio.service.js'
import {
  createWorkerBotAudioTranscriber,
  readWorkerBotAudioTranscriberConfig,
} from '../../src/whatsapp/infrastructure/worker-bot-audio-transcriber.gateway.js'
import type { ApiLogger } from '../../src/shared/api.types.js'
import {
  matchWakePhrase,
  parseWakePhrase,
} from '../../src/whatsapp/domain/bot-wake-phrase.policy.js'
import {
  downloadEvolutionMedia,
  fetchMediaFromMessage,
} from '../../src/whatsapp/infrastructure/evolution-media-download.gateway.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const DRIVER_ID = '00000000-0000-4000-8000-0000000000d1'
const GROUP = '120363025246125486@g.us'
const BOT = '5516900000001'
const DRIVER = '5516988887777'
const SUPPORT = '5516977776666'
const CONNECTION = { apiKey: 'chave', baseUrl: 'https://evolution.exemplo.com', instanceName: 'x' }
const TOKEN = 't'.repeat(40)

function logger(lines: unknown[] = []): ApiLogger {
  const push = (...args: unknown[]) => {
    lines.push(args)
  }
  return { debug: push, error: push, info: push, warn: push } as unknown as ApiLogger
}

const AUDIO = { data: Buffer.from('opus').toString('base64'), mimeType: 'audio/ogg; codecs=opus' }

describe('áudio do bot: transcrição e confirmação', () => {
  test('avisa que está escutando, transcreve e pede confirmação; nada de texto em log', async () => {
    const lines: unknown[] = []
    const replies: string[] = []
    const bot = createWhatsAppBotAudio<string>({
      logger: logger(lines),
      transcriber: { transcribe: async () => ' prorrogação de boleto  nota 17234 ' },
    })
    await bot.receive({
      companyId: COMPANY_ID,
      context: 'ctx',
      conversation: 'user:1',
      download: async () => AUDIO,
      mimeType: 'audio/ogg',
      owner: DRIVER,
      reply: (texts) => {
        replies.push(...texts)
      },
      seconds: 8,
    })
    expect(replies).toEqual([BOT_AUDIO_SPEECH.received])
    await bot.idle()
    expect(replies[1]).toBe(botAudioConfirmationText('prorrogação de boleto nota 17234'))
    expect(JSON.stringify(lines)).not.toContain('17234')

    expect(
      bot.answer({ companyId: COMPANY_ID, conversation: 'user:1', owner: SUPPORT, text: '1' }),
    ).toEqual({ kind: 'none' })
    expect(
      bot.answer({ companyId: COMPANY_ID, conversation: 'user:1', owner: DRIVER, text: 'Sim!' }),
    ).toEqual({ context: 'ctx', kind: 'confirmed', text: 'prorrogação de boleto nota 17234' })
    expect(bot.hasPending({ companyId: COMPANY_ID, conversation: 'user:1', owner: DRIVER })).toBe(
      false,
    )
  })

  test('"2 - Não" descarta; outra mensagem também tira o áudio de cena', async () => {
    const bot = createWhatsAppBotAudio<null>({
      logger: logger(),
      transcriber: { transcribe: async () => 'texto' },
    })
    const receive = () =>
      bot.receive({
        companyId: COMPANY_ID,
        context: null,
        conversation: 'c',
        download: async () => AUDIO,
        mimeType: 'audio/ogg',
        owner: DRIVER,
        reply: () => undefined,
        seconds: null,
      })
    await receive()
    await bot.idle()
    expect(
      bot.answer({ companyId: COMPANY_ID, conversation: 'c', owner: DRIVER, text: '2 - Não' }),
    ).toEqual({ kind: 'discarded' })
    await receive()
    await bot.idle()
    expect(
      bot.answer({ companyId: COMPANY_ID, conversation: 'c', owner: DRIVER, text: 'nota 123' }),
    ).toEqual({ kind: 'none' })
    expect(bot.hasPending({ companyId: COMPANY_ID, conversation: 'c', owner: DRIVER })).toBe(false)
  })

  test('cada erro tem resposta: longo, sem transcritor, download, transcrição e áudio vazio', async () => {
    const cases: Array<{
      readonly download?: () => Promise<typeof AUDIO>
      readonly expected: string
      readonly seconds?: number
      readonly transcribe?: () => Promise<string>
      readonly withoutTranscriber?: boolean
    }> = [
      { expected: BOT_AUDIO_SPEECH.tooLong, seconds: 121 },
      { expected: BOT_AUDIO_SPEECH.unavailable, withoutTranscriber: true },
      {
        download: async () => {
          throw new Error('x')
        },
        expected: BOT_AUDIO_SPEECH.downloadFailed,
      },
      {
        expected: BOT_AUDIO_SPEECH.failed,
        transcribe: async () => {
          throw new Error('busy')
        },
      },
      { expected: BOT_AUDIO_SPEECH.empty, transcribe: async () => '[BLANK_AUDIO]' },
      { expected: BOT_AUDIO_SPEECH.empty, transcribe: async () => '   ' },
    ]
    for (const item of cases) {
      const replies: string[] = []
      const bot = createWhatsAppBotAudio<null>({
        logger: logger(),
        transcriber:
          item.withoutTranscriber === true
            ? undefined
            : { transcribe: item.transcribe ?? (async () => 'ok') },
      })
      await bot.receive({
        companyId: COMPANY_ID,
        context: null,
        conversation: 'c',
        download: item.download ?? (async () => AUDIO),
        mimeType: 'audio/ogg',
        owner: DRIVER,
        reply: (texts) => {
          replies.push(...texts)
        },
        seconds: item.seconds ?? 5,
      })
      await bot.idle()
      expect(replies.at(-1)).toBe(item.expected)
      expect(bot.hasPending({ companyId: COMPANY_ID, conversation: 'c', owner: DRIVER })).toBe(
        false,
      )
    }
  })

  test('o pendente expira em 10 minutos', async () => {
    let now = 0
    const bot = createWhatsAppBotAudio<null>({
      clock: () => now,
      logger: logger(),
      transcriber: { transcribe: async () => 'texto' },
    })
    await bot.receive({
      companyId: COMPANY_ID,
      context: null,
      conversation: 'c',
      download: async () => AUDIO,
      mimeType: 'audio/ogg',
      owner: DRIVER,
      reply: () => undefined,
      seconds: 3,
    })
    await bot.idle()
    now = 10 * 60_000 + 1
    expect(
      bot.answer({ companyId: COMPANY_ID, conversation: 'c', owner: DRIVER, text: '1' }),
    ).toEqual({ kind: 'none' })
  })
})

describe('áudio do bot: download pelo Evolution', () => {
  test('o Evolution ainda não gravou a mensagem: tenta de novo e baixa', async () => {
    const waits: number[] = []
    let calls = 0
    const media = await downloadEvolutionMedia({
      connection: async () => CONNECTION,
      fetchMedia: async () => {
        calls += 1
        if (calls < 3) throw new Error('Message not found')
        return AUDIO
      },
      providerMessageId: 'A1',
      sleep: async (ms) => {
        waits.push(ms)
      },
    })
    expect(media).toEqual(AUDIO)
    expect(waits).toEqual([1_000, 2_000])
  })

  test('com a mensagem do webhook, pede a mídia com ela inteira e não procura pelo id', async () => {
    const sent: unknown[] = []
    const media = await downloadEvolutionMedia({
      connection: async () => CONNECTION,
      fetchMedia: async () => {
        throw new Error('não devia pedir pelo id')
      },
      fetchRawMedia: async (message) => {
        sent.push(message)
        return AUDIO
      },
      providerMessageId: 'A1',
      rawMessage: { key: { id: 'A1' }, message: { audioMessage: { mediaKey: 'k' } } },
    })
    expect(media).toEqual(AUDIO)
    expect(sent).toEqual([{ key: { id: 'A1' }, message: { audioMessage: { mediaKey: 'k' } } }])
  })

  test('a mensagem inteira falhou: cai no pedido por id', async () => {
    const media = await downloadEvolutionMedia({
      connection: async () => CONNECTION,
      fetchMedia: async () => AUDIO,
      fetchRawMedia: async () => {
        throw new Error('boom')
      },
      providerMessageId: 'A1',
      rawMessage: { key: { id: 'A1' }, message: {} },
    })
    expect(media).toEqual(AUDIO)
  })

  test('o pedido com a mensagem vai ao Evolution com a chave e o corpo certos', async () => {
    const calls: { body: unknown; headers: unknown; url: string }[] = []
    const media = await fetchMediaFromMessage(
      CONNECTION,
      { key: { id: 'A1' }, message: { audioMessage: {} } },
      (async (url: string, init: RequestInit) => {
        calls.push({ body: JSON.parse(String(init.body)), headers: init.headers, url })
        return Response.json({ base64: 'b64', mimetype: 'audio/ogg' })
      }) as unknown as typeof fetch,
    )
    expect(media).toEqual({ data: 'b64', mimeType: 'audio/ogg' })
    expect(calls[0]?.url).toBe('https://evolution.exemplo.com/chat/getBase64FromMediaMessage/x')
    expect(calls[0]?.body).toEqual({
      message: { key: { id: 'A1' }, message: { audioMessage: {} } },
    })
    expect(calls[0]?.headers).toMatchObject({ apikey: 'chave' })
  })

  test('desiste depois de 4 tentativas', async () => {
    let calls = 0
    await expect(
      downloadEvolutionMedia({
        connection: async () => CONNECTION,
        fetchMedia: async () => {
          calls += 1
          throw new Error('Message not found')
        },
        providerMessageId: 'A1',
        sleep: async () => undefined,
      }),
    ).rejects.toThrow()
    expect(calls).toBe(4)
  })
})

describe('áudio do bot: número falado', () => {
  test('junta o separador de milhar que o whisper põe no número da nota', () => {
    expect(joinSpokenNumbers('prorrogação do boleto da nota 899.877')).toBe(
      'prorrogação do boleto da nota 899877',
    )
    expect(joinSpokenNumbers('nota 1 234 567 e 12 caixas')).toBe('nota 1234567 e 12 caixas')
    expect(joinSpokenNumbers('nota 17234')).toBe('nota 17234')
  })
})

describe('áudio do bot: transcritor do worker', () => {
  test('só existe com URL e token de 32+ caracteres', () => {
    expect(readWorkerBotAudioTranscriberConfig({})).toBeUndefined()
    expect(
      readWorkerBotAudioTranscriberConfig({
        BOT_AUDIO_TRANSCRIPTION_TOKEN: 'curto',
        WORKER_INTERNAL_URL: 'http://worker.railway.internal:53002',
      }),
    ).toBeUndefined()
    expect(
      readWorkerBotAudioTranscriberConfig({
        BOT_AUDIO_TRANSCRIPTION_TOKEN: TOKEN,
        WORKER_INTERNAL_URL: 'http://worker.railway.internal:53002',
      }),
    ).toEqual({ baseUrl: 'http://worker.railway.internal:53002', token: TOKEN })
  })

  test('manda os bytes com o token e devolve o texto', async () => {
    const calls: Array<{
      readonly auth: null | string
      readonly type: null | string
      readonly url: string
    }> = []
    const transcriber = createWorkerBotAudioTranscriber(
      { baseUrl: 'http://worker:53002/', token: TOKEN },
      (async (url: string, init: RequestInit) => {
        const headers = new Headers(init.headers)
        calls.push({ auth: headers.get('authorization'), type: headers.get('content-type'), url })
        return new Response(JSON.stringify({ data: { text: 'olá' } }), { status: 200 })
      }) as unknown as typeof fetch,
    )
    expect(
      await transcriber.transcribe({ audio: new Uint8Array([1]), mimeType: 'audio/ogg' }),
    ).toBe('olá')
    expect(calls).toEqual([
      {
        auth: `Bearer ${TOKEN}`,
        type: 'audio/ogg',
        url: 'http://worker:53002/internal/bot-audio-transcriptions',
      },
    ])
  })

  test('worker ocupado, fora do ar ou com erro vira falha (o bot responde o erro)', async () => {
    for (const status of [503, 502, 404]) {
      const transcriber = createWorkerBotAudioTranscriber(
        { baseUrl: 'http://worker:53002', token: TOKEN },
        (async () => new Response('{}', { status })) as unknown as typeof fetch,
      )
      await expect(
        transcriber.transcribe({ audio: new Uint8Array([1]), mimeType: 'audio/ogg' }),
      ).rejects.toThrow()
    }
  })
})

function groupMessage(overrides: Partial<EvolutionMessageEvent> = {}): EvolutionMessageEvent {
  return {
    chat: 'group',
    externalMessageId: 'A1',
    from: '',
    fromMe: false,
    groupJid: GROUP,
    mentionedJids: [],
    participant: DRIVER,
    pushName: 'Motorista',
    replyToExternalMessageId: null,
    text: null,
    timestamp: 1,
    type: 'message',
    ...overrides,
  }
}

function groupSetup(
  options: {
    now?: () => number
    openRequestOwner?: null | string
    transcript?: string
    wakePhrase?: string
  } = {},
) {
  const handled: AdmittedGroupMessage[] = []
  const replies: string[] = []
  const downloads: string[] = []
  const gateway: EvolutionGroupDirectoryGatewayPort = {
    getOwnerNumber: async () => BOT,
    listGroupParticipants: async () => [],
  }
  const bot = createWhatsAppBotAudio<GroupAudioContext>({
    logger: logger(),
    transcriber: {
      transcribe: async () => options.transcript ?? 'prorrogação de boleto nota 17234',
    },
  })
  const inbound = createEvolutionGroupInbound({
    audio: {
      bot,
      wakePhrase: parseWakePhrase(options.wakePhrase),
      download: async ({ providerMessageId }) => {
        downloads.push(providerMessageId)
        return AUDIO
      },
      reply: ({ texts }) => {
        replies.push(...texts)
      },
    },
    findGroupDriver: async () => ({ driverId: DRIVER_ID }),
    findOpenRequestOwner: async () => options.openRequestOwner ?? null,
    handle: async (message) => {
      handled.push(message)
    },
    identity: createEvolutionGroupIdentity({ gateway }),
    ...(options.now === undefined ? {} : { now: options.now }),
  })
  const receive = (event: EvolutionMessageEvent, audio: GroupAudio | null = null) =>
    inbound.receive({
      audio,
      companyId: COMPANY_ID,
      connection: async () => CONNECTION,
      event,
      senderLid: null,
    })
  return { bot, downloads, handled, receive, replies }
}

const VOICE: GroupAudio = {
  mimeType: 'audio/ogg; codecs=opus',
  quotedParticipant: null,
  seconds: 6,
}

describe('áudio do bot no grupo', () => {
  test('áudio entre as pessoas do grupo (sem pedido aberto, sem citar o bot) é ignorado', async () => {
    const { downloads, receive, replies } = groupSetup()
    expect(await receive(groupMessage(), VOICE)).toBe('not_addressed')
    expect(downloads).toEqual([])
    expect(replies).toEqual([])
  })

  test('quem tem o pedido aberto manda áudio, confirma com 1 e o texto segue o fluxo', async () => {
    const { bot, downloads, handled, receive, replies } = groupSetup({ openRequestOwner: DRIVER })
    expect(await receive(groupMessage(), VOICE)).toBe('audio')
    await bot.idle()
    expect(downloads).toEqual(['A1'])
    expect(replies).toEqual([
      BOT_AUDIO_SPEECH.received,
      botAudioConfirmationText('prorrogação de boleto nota 17234'),
    ])
    expect(await receive(groupMessage({ externalMessageId: 'T1', text: '1' }))).toBe('admitted')
    expect(handled).toHaveLength(1)
    expect(handled[0]).toMatchObject({
      driverId: DRIVER_ID,
      providerMessageId: 'T1',
      sender: DRIVER,
      text: 'prorrogação de boleto nota 17234',
      via: 'owner_reply',
    })
  })

  test('áudio citando o bot vale sem pedido aberto e confirma como marcação', async () => {
    const { bot, handled, receive } = groupSetup()
    expect(
      await receive(groupMessage({ participant: SUPPORT }), {
        ...VOICE,
        quotedParticipant: `${BOT}@s.whatsapp.net`,
      }),
    ).toBe('audio')
    await bot.idle()
    // Outra pessoa respondendo "1" não confirma o áudio de quem mandou.
    expect(await receive(groupMessage({ externalMessageId: 'T0', text: '1' }))).toBe(
      'not_addressed',
    )
    expect(
      await receive(groupMessage({ externalMessageId: 'T1', participant: SUPPORT, text: 'sim' })),
    ).toBe('admitted')
    expect(handled[0]).toMatchObject({ sender: SUPPORT, via: 'mention' })
  })

  test('2 descarta e avisa no grupo', async () => {
    const { bot, handled, receive, replies } = groupSetup({ openRequestOwner: DRIVER })
    await receive(groupMessage(), VOICE)
    await bot.idle()
    expect(await receive(groupMessage({ externalMessageId: 'T1', text: '2' }))).toBe('admitted')
    expect(handled).toEqual([])
    expect(replies.at(-1)).toBe(BOT_AUDIO_SPEECH.discarded)
  })

  test('lê o áudio de voz do corpo cru, com os segundos e quem foi citado', () => {
    const audio = readGroupAudio({
      data: {
        key: { id: 'A1' },
        message: {
          audioMessage: {
            contextInfo: { participant: `${BOT}@s.whatsapp.net` },
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true,
            seconds: 12,
          },
        },
      },
    })
    expect(audio.get('A1')).toMatchObject({
      mimeType: 'audio/ogg; codecs=opus',
      quotedParticipant: `${BOT}@s.whatsapp.net`,
      seconds: 12,
    })
    // A mensagem inteira vai junto: o Evolution baixa sem procurar no banco dele.
    expect(audio.get('A1')?.rawMessage?.key).toEqual({ id: 'A1' })
    expect(
      readGroupAudio({ data: { key: { id: 'X' }, message: { conversation: 'oi' } } }).size,
    ).toBe(0)
  })
})

describe('áudio do bot no grupo: frase de chamada', () => {
  const PHRASE = parseWakePhrase('atendimento Fernandes')

  test('casa com variações da transcrição e devolve o resto do pedido', () => {
    expect(
      matchWakePhrase(PHRASE, 'Atendimento Fernandes, prorrogação do boleto da nota 899877.'),
    ).toBe('prorrogação do boleto da nota 899877')
    expect(matchWakePhrase(PHRASE, 'Oi, atendimento da Fernandez, ocorrência nota 12')).toBe(
      'Oi, ocorrência nota 12',
    )
    expect(matchWakePhrase(PHRASE, 'Atendimento Fernandes.')).toBe('')
    expect(matchWakePhrase(PHRASE, 'fala Fernandes, chego em 10 minutos')).toBeNull()
    expect(matchWakePhrase(PHRASE, 'atendimento ruim hoje')).toBeNull()
    expect(matchWakePhrase(parseWakePhrase(''), 'atendimento Fernandes')).toBeNull()
  })

  test('áudio sem a frase é transcrito calado e descartado: nada responde, nada fica', async () => {
    const { bot, downloads, handled, receive, replies } = groupSetup({
      transcript: 'chego em dez minutos no cliente',
      wakePhrase: 'atendimento Fernandes',
    })
    expect(await receive(groupMessage(), VOICE)).toBe('audio_listening')
    await bot.idle()
    expect(downloads).toEqual(['A1'])
    expect(replies).toEqual([])
    expect(handled).toEqual([])
    expect(
      bot.hasPending({ companyId: COMPANY_ID, conversation: `group:${GROUP}`, owner: DRIVER }),
    ).toBe(false)
  })

  test('com a frase, pede confirmação do resto e o 1 abre o pedido como marcação', async () => {
    const { bot, handled, receive, replies } = groupSetup({
      transcript: 'Atendimento Fernandes, prorrogação do boleto da nota 899.877',
      wakePhrase: 'atendimento Fernandes',
    })
    await receive(groupMessage(), VOICE)
    await bot.idle()
    expect(replies).toEqual([botAudioConfirmationText('prorrogação do boleto da nota 899877')])
    expect(await receive(groupMessage({ externalMessageId: 'T1', text: '1' }))).toBe('admitted')
    expect(handled[0]).toMatchObject({
      text: 'prorrogação do boleto da nota 899877',
      via: 'mention',
    })
  })

  test('com a sessão aberta, o dono fala sem a frase e o áudio de outra pessoa nem é transcrito', async () => {
    const { bot, downloads, receive, replies } = groupSetup({
      openRequestOwner: DRIVER,
      transcript: 'prorrogação do boleto da nota 899877',
      wakePhrase: 'atendimento Fernandes',
    })
    expect(await receive(groupMessage(), VOICE)).toBe('audio')
    await bot.idle()
    expect(replies.at(-1)).toBe(botAudioConfirmationText('prorrogação do boleto da nota 899877'))
    const before = replies.length
    for (const quotedParticipant of [null, `${BOT}@s.whatsapp.net`]) {
      expect(
        await receive(groupMessage({ externalMessageId: 'S1', participant: SUPPORT }), {
          ...VOICE,
          quotedParticipant,
        }),
      ).toBe('not_addressed')
    }
    await bot.idle()
    expect(downloads).toEqual(['A1'])
    expect(replies).toHaveLength(before)
  })

  test('depois do "2", quem falou reenvia sem a frase (áudio ou texto) por 5 minutos; depois volta a exigir', async () => {
    let clock = 0
    const { bot, downloads, handled, receive, replies } = groupSetup({
      now: () => clock,
      transcript: 'Atendimento Fernandes, prorrogação da nota 899804',
      wakePhrase: 'atendimento Fernandes',
    })
    await receive(groupMessage(), VOICE)
    await bot.idle()
    await receive(groupMessage({ externalMessageId: 'T1', text: '2' }))
    expect(replies.at(-1)).toBe(BOT_AUDIO_SPEECH.discarded)

    // Áudio de novo, sem a frase: ouvido com o "estou escutando" e a confirmação.
    expect(await receive(groupMessage({ externalMessageId: 'A2' }), VOICE)).toBe('audio')
    await bot.idle()
    expect(downloads).toEqual(['A1', 'A2'])
    expect(replies).toContain(BOT_AUDIO_SPEECH.received)
    await receive(groupMessage({ externalMessageId: 'T2', text: '2' }))

    // Por texto, sem marcar o bot: vale como marcação.
    expect(
      await receive(groupMessage({ externalMessageId: 'T3', text: 'prorrogação da nota 899877' })),
    ).toBe('admitted')
    expect(handled.at(-1)).toMatchObject({ text: 'prorrogação da nota 899877', via: 'mention' })

    // A janela vale uma vez e expira: depois de 5 minutos o áudio sem a frase volta a ser calado.
    await receive(groupMessage({ externalMessageId: 'A3' }), VOICE)
    await bot.idle()
    await receive(groupMessage({ externalMessageId: 'T4', text: '2' }))
    clock += BOT_AUDIO_RETRY_WINDOW_MS + 1
    expect(await receive(groupMessage({ externalMessageId: 'A4' }), VOICE)).toBe('audio_listening')
    expect(await receive(groupMessage({ externalMessageId: 'T5', text: 'oi' }))).toBe(
      'not_addressed',
    )
  })

  test('só a frase abre o menu, como o @bot sozinho', async () => {
    const { bot, handled, receive } = groupSetup({
      transcript: 'Atendimento Fernandes.',
      wakePhrase: 'atendimento Fernandes',
    })
    await receive(groupMessage(), VOICE)
    await bot.idle()
    expect(handled[0]).toMatchObject({ text: '', via: 'mention' })
  })

  test('sem frase configurada ou áudio longo: nem transcreve', async () => {
    const off = groupSetup()
    expect(await off.receive(groupMessage(), VOICE)).toBe('not_addressed')
    const long = groupSetup({ wakePhrase: 'atendimento Fernandes' })
    expect(await long.receive(groupMessage(), { ...VOICE, seconds: 61 })).toBe('not_addressed')
    expect([...off.downloads, ...long.downloads]).toEqual([])
  })
})
