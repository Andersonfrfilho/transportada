/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Uma resposta do bot por turno é UMA mensagem do WhatsApp (textos unidos por linha em branco), no grupo e na conversa
 * individual. Defeito de staging (#555/#559): no grupo cada texto virava uma mensagem e o espaçador de envio do Evolution
 * segurava a seguinte — a pergunta chegava depois de o motorista já ter respondido. Só fica separado o que é separado por
 * natureza (lista/botões interativos da Meta, mídia), e a fala do turno sai antes dela, na ordem.
 */
import { describe, expect, test } from 'bun:test'
import type { ChannelAdapterInterface } from '@adatechnology/meta-whatsapp-contracts'

import type { ApiLogger } from '../../src/shared/api.types.js'
import {
  bufferWhatsAppChannel,
  createWhatsAppTurnReplies,
  WHATSAPP_TURN_MESSAGE_LIMIT,
} from '../../src/whatsapp-commands/application/whatsapp-turn-replies.service.js'
import { createEvolutionGroupReplySender } from '../../src/whatsapp/infrastructure/evolution-group-reply.gateway.js'

const logger = { debug() {}, error() {}, info() {}, warn() {} } as unknown as ApiLogger
const GROUP = '120363025246125486@g.us'

function groupSender() {
  const sent: string[] = []
  const mentions: Array<string | undefined> = []
  const turns = createWhatsAppTurnReplies()
  const replies = createEvolutionGroupReplySender({
    logger,
    sendText: async ({ body, mentionNumber }) => {
      sent.push(body)
      mentions.push(mentionNumber)
    },
    turnReplies: turns,
  })
  return { mentions, replies, sent, turns }
}

describe('grupo: a resposta marca quem pediu', () => {
  const REQUESTER = '5516999998888'

  test('o @número abre a mensagem e o número vai em `mentioned`', async () => {
    const { mentions, replies, sent } = groupSender()
    replies.send({
      companyId: 'C1',
      groupJid: GROUP,
      mentionNumber: REQUESTER,
      texts: ['↩️ *Continuando a entrega da NF 899840.*', '📸 Foto?'],
    })
    await replies.idle()
    expect(sent).toEqual([`@${REQUESTER} ↩️ *Continuando a entrega da NF 899840.*\n\n📸 Foto?`])
    expect(mentions).toEqual([REQUESTER])
  })

  test('no turno, as falas viram uma mensagem e a marca vai uma vez, no começo', async () => {
    const { mentions, replies, sent, turns } = groupSender()
    await turns.withinTurn(async () => {
      replies.send({ companyId: 'C1', groupJid: GROUP, mentionNumber: REQUESTER, texts: ['a'] })
      replies.send({ companyId: 'C1', groupJid: GROUP, mentionNumber: REQUESTER, texts: ['b'] })
    })
    await replies.idle()
    expect(sent).toEqual([`@${REQUESTER} a\n\nb`])
    expect(mentions).toEqual([REQUESTER])
  })

  test('texto dividido pelo teto: só a primeira parte leva a marca', async () => {
    const { mentions, replies, sent } = groupSender()
    const first = 'x'.repeat(2500)
    const second = 'y'.repeat(2500)
    replies.send({
      companyId: 'C1',
      groupJid: GROUP,
      mentionNumber: REQUESTER,
      texts: [`${first}\n${second}`],
    })
    await replies.idle()
    expect(sent).toEqual([`@${REQUESTER} ${first}`, second])
    expect(mentions).toEqual([REQUESTER, undefined])
  })

  test('sem quem marcar (ou número que não é de telefone), sai sem marca e sem falhar', async () => {
    const { mentions, replies, sent } = groupSender()
    replies.send({ companyId: 'C1', groupJid: GROUP, texts: ['aviso'] })
    replies.send({ companyId: 'C1', groupJid: GROUP, mentionNumber: 'abc', texts: ['outro'] })
    await replies.idle()
    expect(sent).toEqual(['aviso', 'outro'])
    expect(mentions).toEqual([undefined, undefined])
  })
})

describe('grupo: uma resposta por turno é uma mensagem do Evolution', () => {
  test('os textos de uma resposta saem numa mensagem só, unidos por linha em branco', async () => {
    const { replies, sent } = groupSender()
    replies.send({ companyId: 'C1', groupJid: GROUP, texts: ['Localização recebida.', '📸 Foto?'] })
    await replies.idle()
    expect(sent).toEqual(['Localização recebida.\n\n📸 Foto?'])
  })

  test('duas respostas no mesmo turno (a baixa e a oferta da próxima rota) também viram uma mensagem', async () => {
    const { replies, sent, turns } = groupSender()
    await turns.withinTurn(async () => {
      replies.send({ companyId: 'C1', groupJid: GROUP, texts: ['Entrega registrada.'] })
      replies.send({ companyId: 'C1', groupJid: GROUP, texts: ['➡️ Próxima parada', '1 - Seguir'] })
      await Promise.resolve()
      expect(sent).toEqual([])
    })
    await replies.idle()
    expect(sent).toEqual(['Entrega registrada.\n\n➡️ Próxima parada\n\n1 - Seguir'])
  })

  test('grupos diferentes no mesmo turno não se misturam', async () => {
    const { replies, sent, turns } = groupSender()
    await turns.withinTurn(async () => {
      replies.send({ companyId: 'C1', groupJid: GROUP, texts: ['a'] })
      replies.send({ companyId: 'C1', groupJid: 'outro@g.us', texts: ['b'] })
      replies.send({ companyId: 'C1', groupJid: GROUP, texts: ['c'] })
    })
    await replies.idle()
    expect(sent.toSorted()).toEqual(['a\n\nc', 'b'])
  })

  test('a fala que chega depois do turno (a transcrição do áudio) sai sozinha, sem esperar outro turno', async () => {
    const { replies, sent, turns } = groupSender()
    let later: Promise<void> = Promise.resolve()
    await turns.withinTurn(async () => {
      replies.send({ companyId: 'C1', groupJid: GROUP, texts: ['🎙️ Estou escutando.'] })
      later = (async () => {
        await Bun.sleep(5)
        replies.send({ companyId: 'C1', groupJid: GROUP, texts: ['🎙️ Entendi assim.'] })
      })()
    })
    await later
    await replies.idle()
    expect(sent).toEqual(['🎙️ Estou escutando.', '🎙️ Entendi assim.'])
  })

  test('o turno que falha ainda entrega o que já foi dito', async () => {
    const { replies, sent, turns } = groupSender()
    await expect(
      turns.withinTurn(async () => {
        replies.send({ companyId: 'C1', groupJid: GROUP, texts: ['a', 'b'] })
        throw new Error('quebrou')
      }),
    ).rejects.toThrow('quebrou')
    await replies.idle()
    expect(sent).toEqual(['a\n\nb'])
  })
})

describe('conversa individual: uma resposta por turno é uma mensagem da Meta', () => {
  function directChannel() {
    const calls: string[] = []
    const turns = createWhatsAppTurnReplies()
    const raw = {
      sendInteractiveButtons: async ({ body, to }: { body: string; to: string }) => {
        calls.push(`buttons:${to}:${body}`)
        return { externalMessageId: null }
      },
      sendInteractiveList: async ({ body, to }: { body: string; to: string }) => {
        calls.push(`list:${to}:${body}`)
        return { externalMessageId: null }
      },
      sendText: async (to: string, body: string) => {
        calls.push(`text:${to}:${body}`)
        return { externalMessageId: null }
      },
    } as unknown as ChannelAdapterInterface
    return { calls, channel: bufferWhatsAppChannel(raw, turns), turns }
  }

  test('os textos do turno saem numa mensagem só', async () => {
    const { calls, channel, turns } = directChannel()
    await turns.withinTurn(async () => {
      await channel.sendText('5516', 'Localização recebida.')
      await channel.sendText('5516', '📸 Foto?')
      expect(calls).toEqual([])
    })
    expect(calls).toEqual(['text:5516:Localização recebida.\n\n📸 Foto?'])
  })

  test('a lista interativa é separada por natureza: a fala do turno sai antes dela, numa mensagem', async () => {
    const { calls, channel, turns } = directChannel()
    await turns.withinTurn(async () => {
      await channel.sendText('5516', 'Certo.')
      await channel.sendText('5516', 'Agora escolha.')
      await channel.sendInteractiveList({
        body: 'Toque na nota.',
        buttonLabel: 'Ver',
        rows: [],
        to: '5516',
      } as never)
      await channel.sendText('5516', 'Toque numa nota da lista acima.')
    })
    expect(calls).toEqual([
      'text:5516:Certo.\n\nAgora escolha.',
      'list:5516:Toque na nota.',
      'text:5516:Toque numa nota da lista acima.',
    ])
  })

  test('fora de um turno (aviso do sistema) o texto sai na hora', async () => {
    const { calls, channel } = directChannel()
    await channel.sendText('5516', 'aviso')
    expect(calls).toEqual(['text:5516:aviso'])
  })
})

describe('revisão do #561: tamanho, falha na entrega e isolamento', () => {
  function recordingTurns(options: { readonly failFor?: string } = {}) {
    const warnings: Record<string, unknown>[] = []
    const turnLogger = {
      ...logger,
      warn: (_message: string, fields?: Record<string, unknown>) =>
        void warnings.push(fields ?? {}),
    } as unknown as ApiLogger
    const turns = createWhatsAppTurnReplies({ logger: turnLogger })
    const delivered: { key: string; body: string }[] = []
    const send = (key: string, body: string) =>
      turns.send({
        body,
        deliver: async (joined) => {
          if (key === options.failFor) throw new TypeError('rede fora')
          delivered.push({ body: joined, key })
        },
        key,
      })
    return { delivered, send, turns, warnings }
  }

  test(`a mensagem nunca passa de ${WHATSAPP_TURN_MESSAGE_LIMIT} caracteres: corta nas linhas em branco, em ordem`, async () => {
    const { delivered, send, turns } = recordingTurns()
    const a = 'a'.repeat(3000)
    const b = 'b'.repeat(3000)
    const c = 'c'.repeat(3000)
    await turns.withinTurn(async () => {
      await send('K', a)
      await send('K', b)
      await send('K', c)
    })
    expect(delivered.map((item) => item.body)).toEqual([a, b, c])
  })

  test('falas curtas seguem juntas até o limite', async () => {
    const { delivered, send, turns } = recordingTurns()
    const big = 'x'.repeat(3990)
    await turns.withinTurn(async () => {
      await send('K', 'oi')
      await send('K', 'tudo bem?')
      await send('K', big)
    })
    expect(delivered.map((item) => item.body)).toEqual(['oi\n\ntudo bem?', big])
  })

  test('uma fala maior que o limite é cortada nas quebras de linha (e, sem quebra, no limite)', async () => {
    const { delivered, send, turns } = recordingTurns()
    const line = 'y'.repeat(1500)
    const long = Array.from({ length: 6 }, () => line).join('\n')
    const solid = 'z'.repeat(WHATSAPP_TURN_MESSAGE_LIMIT + 10)
    await turns.withinTurn(async () => {
      await send('K', long)
    })
    await turns.withinTurn(async () => {
      await send('S', solid)
    })
    const bodies = delivered.map((item) => item.body)
    expect(bodies.every((body) => body.length <= WHATSAPP_TURN_MESSAGE_LIMIT)).toBe(true)
    expect(bodies.slice(0, 3)).toEqual([`${line}\n${line}`, `${line}\n${line}`, `${line}\n${line}`])
    expect(bodies.slice(3).join('')).toBe(solid)
  })

  test('a fala fora do turno também respeita o limite', async () => {
    const { delivered, send } = recordingTurns()
    await send('K', 'w'.repeat(WHATSAPP_TURN_MESSAGE_LIMIT * 2))
    expect(delivered.map((item) => item.body.length)).toEqual([
      WHATSAPP_TURN_MESSAGE_LIMIT,
      WHATSAPP_TURN_MESSAGE_LIMIT,
    ])
  })

  test('falha na entrega no fim do turno vai a log sem PII, não derruba o turno e não pula os outros destinos', async () => {
    const { delivered, send, turns, warnings } = recordingTurns({ failFor: '5516999990000' })
    await expect(
      turns.withinTurn(
        async () => {
          await send('5516999990000', 'para quem falha')
          await send('OUTRO', 'para quem recebe')
          return 'ok'
        },
        { companyId: 'C1' },
      ),
    ).resolves.toBe('ok')
    expect(delivered).toEqual([{ body: 'para quem recebe', key: 'OUTRO' }])
    expect(warnings).toEqual([{ companyId: 'C1', errorName: 'TypeError' }])
    expect(JSON.stringify(warnings)).not.toContain('5516999990000')
    expect(JSON.stringify(warnings)).not.toContain('para quem')
  })

  test('o erro do turno é o que sobe, nunca o da entrega', async () => {
    const { send, turns } = recordingTurns({ failFor: 'K' })
    await expect(
      turns.withinTurn(async () => {
        await send('K', 'fala')
        throw new RangeError('erro do turno')
      }),
    ).rejects.toThrow('erro do turno')
  })

  test('cada instância tem o seu turno: o envio de outra instância não entra na mensagem deste', async () => {
    const first = recordingTurns()
    const second = recordingTurns()
    await first.turns.withinTurn(async () => {
      await second.send('K', 'do outro canal')
      expect(second.delivered).toEqual([{ body: 'do outro canal', key: 'K' }])
    })
  })
})
