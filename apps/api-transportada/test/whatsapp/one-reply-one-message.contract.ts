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
} from '../../src/whatsapp-commands/application/whatsapp-turn-replies.service.js'
import { createEvolutionGroupReplySender } from '../../src/whatsapp/infrastructure/evolution-group-reply.gateway.js'

const logger = { debug() {}, error() {}, info() {}, warn() {} } as unknown as ApiLogger
const GROUP = '120363025246125486@g.us'

function groupSender() {
  const sent: string[] = []
  const turns = createWhatsAppTurnReplies()
  const replies = createEvolutionGroupReplySender({
    logger,
    sendText: async ({ body }) => void sent.push(body),
    turnReplies: turns,
  })
  return { replies, sent, turns }
}

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
